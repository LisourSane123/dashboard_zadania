import sqlite3
import os
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "zadania.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


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
            sort_order INTEGER NOT NULL DEFAULT 0,
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
    # Migration: add sort_order column if missing (existing databases)
    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        # Assign initial sort_order based on existing id order
        rows = conn.execute("SELECT id FROM tasks ORDER BY id").fetchall()
        for idx, row in enumerate(rows):
            conn.execute("UPDATE tasks SET sort_order = ? WHERE id = ?", (idx, row["id"]))
        conn.commit()
    except Exception:
        pass  # Column already exists
    conn.commit()
    conn.close()


# --- Task CRUD ---

def add_task(title, description="", is_recurring=False, recurrence_type=None, recurrence_value=None, sort_order=None):
    """Add a new task.
    recurrence_type: 'days', 'weeks', 'months'
    recurrence_value: integer (e.g., every 2 days)
    """
    conn = get_db()
    if sort_order is None:
        row = conn.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks").fetchone()
        sort_order = row["next_order"]
    cur = conn.execute(
        """INSERT INTO tasks (title, description, is_recurring, recurrence_type, recurrence_value, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (title, description, int(is_recurring), recurrence_type, recurrence_value, sort_order)
    )
    task_id = cur.lastrowid
    conn.commit()
    conn.close()
    return task_id


def update_task(task_id, title=None, description=None, recurrence_type=None, recurrence_value=None, sort_order=None):
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

def get_tasks_for_today():
    """Get tasks that should be displayed today on the dashboard."""
    all_tasks = get_all_tasks()
    today_tasks = []
    now = datetime.now()

    for task in all_tasks:
        if not task["is_recurring"]:
            # One-time task - always show if active
            today_tasks.append({**task, "completed_today": False})
            continue

        # Recurring task - check if already completed within current cycle
        last = get_last_completion(task["id"])
        if last is None:
            # Never completed - show it
            today_tasks.append({**task, "completed_today": False})
            continue

        rec_type = task["recurrence_type"]
        rec_val = task["recurrence_value"] or 1

        if rec_type == "days":
            next_due = last + timedelta(days=rec_val)
        elif rec_type == "weeks":
            next_due = last + timedelta(weeks=rec_val)
        elif rec_type == "months":
            month = last.month + rec_val
            year = last.year + (month - 1) // 12
            month = ((month - 1) % 12) + 1
            day = min(last.day, 28)
            next_due = last.replace(year=year, month=month, day=day)
        else:
            next_due = last + timedelta(days=1)

        if now >= next_due:
            today_tasks.append({**task, "completed_today": False})
        else:
            today_tasks.append({**task, "completed_today": True})

    return today_tasks
