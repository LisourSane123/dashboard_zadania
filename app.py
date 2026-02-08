from flask import Flask, render_template, request, jsonify, redirect, url_for
from database import init_db, add_task, update_task, delete_task, get_all_tasks, \
    get_recurring_tasks, get_task, complete_task, get_tasks_for_today, get_completion_history

app = Flask(__name__)


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
    recurrence_type = data.get("recurrence_type")  # days / weeks / months
    recurrence_value = data.get("recurrence_value")  # int

    if is_recurring and (not recurrence_type or not recurrence_value):
        return jsonify({"status": "error", "message": "Recurrence details required"}), 400

    task_id = add_task(title, description, is_recurring, recurrence_type, recurrence_value)
    return jsonify({"status": "ok", "id": task_id}), 201


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def api_update_task(task_id):
    data = request.get_json(force=True)
    title = data.get("title")
    description = data.get("description")
    recurrence_type = data.get("recurrence_type")
    recurrence_value = data.get("recurrence_value")
    update_task(task_id, title, description, recurrence_type, recurrence_value)
    return jsonify({"status": "ok"})


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def api_delete_task(task_id):
    delete_task(task_id)
    return jsonify({"status": "ok"})


@app.route("/api/tasks/<int:task_id>/history", methods=["GET"])
def api_task_history(task_id):
    history = get_completion_history(task_id)
    return jsonify(history)


# ──────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
