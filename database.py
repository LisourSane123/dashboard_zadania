import sqlite3
import os
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "zadania.db")

# Monday=0 .. Sunday=6  (Python weekday convention)
WEEKDAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _migrate(conn):
    """Run safe ALTER TABLE migrations for new columns."""
    migrations = [
        ("sort_order", "ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"),
        ("recurrence_days", "ALTER TABLE tasks ADD COLUMN recurrence_days TEXT DEFAULT NULL"),
        ("start_date", "ALTER TABLE tasks ADD COLUMN start_date TEXT DEFAULT NULL"),
        ("end_date", "ALTER TABLE tasks ADD COLUMN end_date TEXT DEFAULT NULL"),
    ]
    for col, sql in migrations:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass  # column already exists

    # Back-fill sort_order if all zeros
    rows = conn.execute("SELECT id, sort_order FROM tasks ORDER BY id").fetchall()
    if rows and all(r["sort_order"] == 0 for r in rows) and len(rows) > 1:
        for idx, row in enumerate(rows):
            conn.execute("UPDATE tasks SET sort_order = ? WHERE id = ?", (idx, row["id"]))
        conn.commit()


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            is_recurring INTEGER NOT NULL DEFAULT 0,
            recurrence_type TEXT DEFAULT NULL,
            recurrence_value INTEGER DEFAULT NULL,
            recurrence_days TEXT DEFAULT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            start_date TEXT DEFAULT NULL,
            end_date TEXT DEFAULT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            completed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );
    """)
    _migrate(conn)
    conn.commit()
    conn.close()


# --- Task CRUD ---

def add_task(title, description="", is_recurring=False, recurrence_type=None,
             recurrence_value=None, recurrence_days=None, start_date=None, end_date=None, sort_order=None):
    """Add a new task.
    recurrence_type: 'days', 'weeks', 'months', 'weekdays'
    recurrence_value: integer (e.g., every 2 days) — ignored when type='weekdays'
    recurrence_days: comma-separated weekday codes e.g. 'mon,wed,fri'
    start_date: 'YYYY-MM-DD' — task won't appear before this date
    end_date: 'YYYY-MM-DD' — task deactivated after this date
    """
    conn = get_db()
    if sort_order is None:
        row = conn.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks").fetchone()
        sort_order = row["next_order"]
    cur = conn.execute(
        """INSERT INTO tasks (title, description, is_recurring, recurrence_type,
           recurrence_value, recurrence_days, start_date, end_date, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, description, int(is_recurring), recurrence_type,
         recurrence_value, recurrence_days, start_date, end_date, sort_order)
    )
    task_id = cur.lastrowid
    conn.commit()
    conn.close()
    return task_id


def update_task(task_id, title=None, description=None, recurrence_type=None,
                recurrence_value=None, recurrence_days=None, start_date=None, end_date=None, sort_order=None):
    conn = get_db()
    fields = []
    values = []
    if title is not None:
        fields.append("title = ?")
        values.append(title)
    if description is not None:
        fields.append("description = ?")
        values.append(description)
    if recurrence_type is not None:
        fields.append("recurrence_type = ?")
        values.append(recurrence_type)
    if recurrence_value is not None:
        fields.append("recurrence_value = ?")
        values.append(int(recurrence_value))
    if recurrence_days is not None:
        fields.append("recurrence_days = ?")
        values.append(recurrence_days if recurrence_days else None)
    if start_date is not None:
        fields.append("start_date = ?")
        values.append(start_date if start_date else None)
    if end_date is not None:
        fields.append("end_date = ?")
        values.append(end_date if end_date else None)
    if sort_order is not None:
        fields.append("sort_order = ?")
        values.append(int(sort_order))
    if not fields:
        conn.close()
        return
    values.append(task_id)
    conn.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", values)
    conn.commit()
    conn.close()


def delete_task(task_id):
    conn = get_db()
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()


def get_all_tasks():
    conn = get_db()
    rows = conn.execute("SELECT * FROM tasks WHERE active = 1 ORDER BY sort_order, id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_recurring_tasks():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM tasks WHERE active = 1 AND is_recurring = 1 ORDER BY sort_order, id"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def reorder_tasks(task_ids):
    """Set sort_order for tasks based on the order of IDs provided."""
    conn = get_db()
    for idx, tid in enumerate(task_ids):
        conn.execute("UPDATE tasks SET sort_order = ? WHERE id = ?", (idx, tid))
    conn.commit()
    conn.close()


def set_task_position(task_id, new_position):
    """Move a task to a specific position (1-based). Shifts other tasks accordingly."""
    conn = get_db()
    pos = max(0, new_position - 1)  # convert to 0-based
    rows = conn.execute("SELECT id FROM tasks WHERE active = 1 ORDER BY sort_order, id").fetchall()
    ids = [r["id"] for r in rows]
    if task_id not in ids:
        conn.close()
        return
    ids.remove(task_id)
    pos = min(pos, len(ids))
    ids.insert(pos, task_id)
    for idx, tid in enumerate(ids):
        conn.execute("UPDATE tasks SET sort_order = ? WHERE id = ?", (idx, tid))
    conn.commit()
    conn.close()


def get_task(task_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


# --- Completions ---

def complete_task(task_id):
    """Mark a task as completed. For one-time tasks, deactivate them."""
    conn = get_db()
    task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        conn.close()
        return False

    conn.execute("INSERT INTO completions (task_id) VALUES (?)", (task_id,))

    if not task["is_recurring"]:
        conn.execute("UPDATE tasks SET active = 0 WHERE id = ?", (task_id,))

    conn.commit()
    conn.close()
    return True


def get_last_completion(task_id):
    conn = get_db()
    row = conn.execute(
        "SELECT completed_at FROM completions WHERE task_id = ? ORDER BY completed_at DESC LIMIT 1",
        (task_id,)
    ).fetchone()
    conn.close()
    if row:
        return datetime.strptime(row["completed_at"], "%Y-%m-%d %H:%M:%S")
    return None


def get_completion_history(task_id, limit=50):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM completions WHERE task_id = ? ORDER BY completed_at DESC LIMIT ?",
        (task_id, limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- Dashboard logic ---

def _is_today_weekday_match(recurrence_days):
    """Check if today's weekday is in the comma-separated list (mon,tue,wed,thu,fri,sat,sun)."""
    if not recurrence_days:
        return False
    today_code = WEEKDAY_NAMES[datetime.now().weekday()]
    days = [d.strip().lower() for d in recurrence_days.split(",")]
    return today_code in days


def _was_completed_today(task_id):
    """Check if task was already completed today."""
    conn = get_db()
    today_str = date.today().isoformat()
    row = conn.execute(
        "SELECT id FROM completions WHERE task_id = ? AND completed_at >= ? LIMIT 1",
        (task_id, today_str)
    ).fetchone()
    conn.close()
    return row is not None


def get_tasks_for_today():
    """Get tasks that should be displayed today on the dashboard."""
    all_tasks = get_all_tasks()
    today_tasks = []
    now = datetime.now()
    today = date.today()

    for task in all_tasks:
        # ── Check start_date: don't show task before its start date ──
        if task.get("start_date"):
            try:
                start = date.fromisoformat(task["start_date"])
                if today < start:
                    continue
            except ValueError:
                pass

        # ── Check end_date: don't show task after its end date ──
        if task.get("end_date"):
            try:
                end = date.fromisoformat(task["end_date"])
                if today > end:
                    continue
            except ValueError:
                pass

        if not task["is_recurring"]:
            # One-time task — show if active
            today_tasks.append({**task, "completed_today": False})
            continue

        # ── Recurring: weekdays mode (e.g. every Tuesday) ──
        rec_type = task["recurrence_type"]
        if rec_type == "weekdays":
            if not _is_today_weekday_match(task.get("recurrence_days")):
                continue  # not scheduled for today
            completed = _was_completed_today(task["id"])
            if not completed:
                today_tasks.append({**task, "completed_today": False})
            # if completed today — hide it (already done)
            continue

        # ── Recurring: interval mode (days/weeks/months) ──
        last = get_last_completion(task["id"])
        if last is None:
            today_tasks.append({**task, "completed_today": False})
            continue

        # Użyj daty (nie datetime) — zadanie ma pojawić się o północy,
        # niezależnie od godziny ukończenia
        last_date = last.date()
        rec_val = task["recurrence_value"] or 1

        if rec_type == "days":
            next_due = last_date + timedelta(days=rec_val)
        elif rec_type == "weeks":
            next_due = last_date + timedelta(weeks=rec_val)
        elif rec_type == "months":
            month = last_date.month + rec_val
            year = last_date.year + (month - 1) // 12
            month = ((month - 1) % 12) + 1
            day = min(last_date.day, 28)
            next_due = last_date.replace(year=year, month=month, day=day)
        else:
            next_due = last_date + timedelta(days=1)

        if today >= next_due:
            today_tasks.append({**task, "completed_today": False})
        # else: not due yet — hide

    return today_tasks
