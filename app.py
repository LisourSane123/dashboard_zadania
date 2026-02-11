from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory
import os
import glob
import subprocess
import time
from database import init_db, add_task, update_task, delete_task, get_all_tasks, \
    get_recurring_tasks, get_task, complete_task, get_tasks_for_today, get_completion_history, \
    reorder_tasks, set_task_position

app = Flask(__name__)


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(
        os.path.join(app.root_path, "static"),
        "favicon.ico",
        mimetype="image/x-icon",
    )


# ──────────────────────────────────────────────
#  Display control (RPi backlight + screen power)
# ──────────────────────────────────────────────

def _display_power(on):
    """Turn RPi display on/off using every available method."""
    results = {}
    env = {**os.environ, "DISPLAY": os.environ.get("DISPLAY", ":0")}

    # 1) sysfs brightness
    bri_paths = glob.glob("/sys/class/backlight/*/brightness")
    if bri_paths:
        try:
            if on:
                max_paths = glob.glob("/sys/class/backlight/*/max_brightness")
                val = 255
                if max_paths:
                    with open(max_paths[0]) as f:
                        val = int(f.read().strip())
            else:
                val = 0
            with open(bri_paths[0], "w") as f:
                f.write(str(val))
            results["brightness"] = True
        except OSError as e:
            results["brightness"] = str(e)

    # 2) sysfs bl_power (0 = on, 1 = off on most panels)
    bl_paths = glob.glob("/sys/class/backlight/*/bl_power")
    if bl_paths:
        try:
            with open(bl_paths[0], "w") as f:
                f.write("0" if on else "1")
            results["bl_power"] = True
        except OSError as e:
            results["bl_power"] = str(e)

    # 3) vcgencmd display_power (works for DSI & HDMI on RPi)
    try:
        subprocess.run(
            ["vcgencmd", "display_power", "1" if on else "0"],
            capture_output=True, timeout=5, env=env,
        )
        results["vcgencmd"] = True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # 4) xset dpms (X11)
    try:
        if on:
            subprocess.run(["xset", "dpms", "force", "on"],
                           capture_output=True, timeout=5, env=env)
        else:
            subprocess.run(["xset", "dpms", "force", "off"],
                           capture_output=True, timeout=5, env=env)
        results["xset"] = True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return results


@app.route("/api/backlight/off", methods=["POST"])
def backlight_off():
    r = _display_power(False)
    return jsonify({"ok": True, "methods": r})


@app.route("/api/backlight/on", methods=["POST"])
def backlight_on():
    r = _display_power(True)
    return jsonify({"ok": True, "methods": r})


@app.route("/api/screen/off", methods=["POST"])
def screen_off():
    """Night mode – turn off display AND cut USB power to screen."""
    r = _display_power(False)
    # Also try uhubctl to cut USB power entirely
    try:
        subprocess.run(["uhubctl", "-a", "off", "-p", "2"],
                       capture_output=True, timeout=10)
        r["uhubctl"] = True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # If uhubctl not available, try generic USB power off
        try:
            subprocess.run(["uhubctl", "-a", "off"],
                           capture_output=True, timeout=10)
            r["uhubctl"] = True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            r["uhubctl"] = False
    return jsonify({"ok": True, "methods": r})


@app.route("/api/screen/on", methods=["POST"])
def screen_on():
    """Restore USB power + display."""
    results = {}
    # Restore USB power first (so screen has power before we set backlight)
    try:
        subprocess.run(["uhubctl", "-a", "on", "-p", "2"],
                       capture_output=True, timeout=10)
        results["uhubctl"] = True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        try:
            subprocess.run(["uhubctl", "-a", "on"],
                           capture_output=True, timeout=10)
            results["uhubctl"] = True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            results["uhubctl"] = False
    time.sleep(2)  # Give screen time to power up
    r = _display_power(True)
    results.update(r)
    return jsonify({"ok": True, "methods": results})


# ──────────────────────────────────────────────
#  Dashboard (touchscreen kiosk)
# ──────────────────────────────────────────────

@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/api/tasks/today")
def api_tasks_today():
    """Return tasks that should appear on today's dashboard."""
    tasks = get_tasks_for_today()
    return jsonify(tasks)


@app.route("/api/tasks/<int:task_id>/complete", methods=["POST"])
def api_complete_task(task_id):
    ok = complete_task(task_id)
    if ok:
        return jsonify({"status": "ok"})
    return jsonify({"status": "error", "message": "Task not found"}), 404


# ──────────────────────────────────────────────
#  Admin panel (accessed from another device)
# ──────────────────────────────────────────────

@app.route("/admin")
def admin():
    return render_template("admin.html")


@app.route("/api/tasks", methods=["GET"])
def api_get_tasks():
    tasks = get_all_tasks()
    return jsonify(tasks)


@app.route("/api/tasks/recurring", methods=["GET"])
def api_get_recurring():
    tasks = get_recurring_tasks()
    return jsonify(tasks)


@app.route("/api/tasks", methods=["POST"])
def api_add_task():
    data = request.get_json(force=True)
    title = data.get("title", "").strip()
    if not title:
        return jsonify({"status": "error", "message": "Title is required"}), 400

    description = data.get("description", "").strip()
    is_recurring = bool(data.get("is_recurring", False))
    recurrence_type = data.get("recurrence_type")  # days / weeks / months / weekdays
    recurrence_value = data.get("recurrence_value")  # int
    recurrence_days = data.get("recurrence_days")  # e.g. "mon,wed,fri"
    start_date = data.get("start_date")  # e.g. "2026-02-16"
    end_date = data.get("end_date")  # e.g. "2026-03-01"

    if is_recurring:
        if recurrence_type == "weekdays":
            if not recurrence_days:
                return jsonify({"status": "error", "message": "Wybierz dni tygodnia"}), 400
        elif not recurrence_type or not recurrence_value:
            return jsonify({"status": "error", "message": "Recurrence details required"}), 400

    task_id = add_task(title, description, is_recurring, recurrence_type,
                       recurrence_value, recurrence_days, start_date, end_date)
    return jsonify({"status": "ok", "id": task_id}), 201


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def api_update_task(task_id):
    data = request.get_json(force=True)
    title = data.get("title")
    description = data.get("description")
    recurrence_type = data.get("recurrence_type")
    recurrence_value = data.get("recurrence_value")
    recurrence_days = data.get("recurrence_days")
    start_date = data.get("start_date")
    end_date = data.get("end_date")
    sort_order = data.get("sort_order")
    update_task(task_id, title, description, recurrence_type, recurrence_value,
               recurrence_days, start_date, end_date, sort_order)
    return jsonify({"status": "ok"})


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def api_delete_task(task_id):
    delete_task(task_id)
    return jsonify({"status": "ok"})


@app.route("/api/tasks/reorder", methods=["POST"])
def api_reorder_tasks():
    data = request.get_json(force=True)
    task_ids = data.get("task_ids", [])
    if not task_ids:
        return jsonify({"status": "error", "message": "No task IDs provided"}), 400
    reorder_tasks(task_ids)
    return jsonify({"status": "ok"})


@app.route("/api/tasks/<int:task_id>/position", methods=["POST"])
def api_set_position(task_id):
    data = request.get_json(force=True)
    position = data.get("position")
    if position is None or not isinstance(position, int) or position < 1:
        return jsonify({"status": "error", "message": "Podaj pozycję (liczba >= 1)"}), 400
    set_task_position(task_id, position)
    return jsonify({"status": "ok"})


@app.route("/api/tasks/<int:task_id>/history", methods=["GET"])
def api_task_history(task_id):
    history = get_completion_history(task_id)
    return jsonify(history)


# ──────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
