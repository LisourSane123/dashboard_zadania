// ════════════════════════════════════════════════
//  Admin Panel – Task Management
// ════════════════════════════════════════════════

(function () {
    "use strict";

    let currentFilter = "all";
    let allTasks = [];

    const WEEKDAY_LABELS = {
        mon: "Pn", tue: "Wt", wed: "Śr", thu: "Cz", fri: "Pt", sat: "Sb", sun: "Nd"
    };

    // ─── DOM refs ───
    const addForm = document.getElementById("add-form");
    const isRecurring = document.getElementById("is-recurring");
    const recurrenceFields = document.getElementById("recurrence-fields");
    const recurrenceType = document.getElementById("recurrence-type");
    const intervalFields = document.getElementById("interval-fields");
    const weekdayFields = document.getElementById("weekday-fields");
    const tasksList = document.getElementById("tasks-list");
    const editModal = document.getElementById("edit-modal");
    const editForm = document.getElementById("edit-form");
    const toast = document.getElementById("toast");

    // ─── Tabs ───
    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentFilter = tab.dataset.filter;
            renderTasks();
        });
    });

    // ─── Recurring checkbox toggle ───
    isRecurring.addEventListener("change", () => {
        recurrenceFields.classList.toggle("hidden", !isRecurring.checked);
    });

    // ─── Recurrence type toggle (interval vs weekdays) ───
    recurrenceType.addEventListener("change", () => {
        const isWeekdays = recurrenceType.value === "weekdays";
        intervalFields.classList.toggle("hidden", isWeekdays);
        weekdayFields.classList.toggle("hidden", !isWeekdays);
    });

    // ─── Weekday buttons toggle ───
    document.querySelectorAll("#weekday-fields .weekday-btn").forEach(btn => {
        btn.addEventListener("click", () => btn.classList.toggle("active"));
    });
    document.querySelectorAll("#edit-weekday-fields .weekday-btn").forEach(btn => {
        btn.addEventListener("click", () => btn.classList.toggle("active"));
    });

    // ─── Edit modal recurrence type toggle ───
    const editRecurrenceType = document.getElementById("edit-recurrence-type");
    editRecurrenceType.addEventListener("change", () => {
        const isWeekdays = editRecurrenceType.value === "weekdays";
        document.getElementById("edit-interval-fields").classList.toggle("hidden", isWeekdays);
        document.getElementById("edit-weekday-fields").classList.toggle("hidden", !isWeekdays);
    });

    // ─── Helper: get selected weekdays ───
    function getSelectedWeekdays(container) {
        return Array.from(container.querySelectorAll(".weekday-btn.active"))
            .map(btn => btn.dataset.day)
            .join(",");
    }

    function setSelectedWeekdays(container, daysStr) {
        container.querySelectorAll(".weekday-btn").forEach(btn => btn.classList.remove("active"));
        if (!daysStr) return;
        const days = daysStr.split(",").map(d => d.trim());
        days.forEach(d => {
            const btn = container.querySelector(`.weekday-btn[data-day="${d}"]`);
            if (btn) btn.classList.add("active");
        });
    }

    // ─── Add task ───
    addForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = document.getElementById("title").value.trim();
        const description = document.getElementById("description").value.trim();
        const startDate = document.getElementById("start-date").value || null;
        const endDate = document.getElementById("end-date").value || null;
        const recurring = isRecurring.checked;
        const recType = recurrenceType.value;
        const recurrenceValue = parseInt(document.getElementById("recurrence-value").value) || 1;

        if (!title) return;

        const body = {
            title,
            description,
            is_recurring: recurring,
            start_date: startDate,
            end_date: endDate,
        };

        if (recurring) {
            body.recurrence_type = recType;
            if (recType === "weekdays") {
                body.recurrence_days = getSelectedWeekdays(weekdayFields);
                if (!body.recurrence_days) {
                    showToast("Wybierz przynajmniej jeden dzień tygodnia", true);
                    return;
                }
            } else {
                body.recurrence_value = recurrenceValue;
            }
        }

        try {
            const resp = await fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await resp.json();

            if (resp.ok) {
                showToast("Zadanie dodane ✓");
                addForm.reset();
                recurrenceFields.classList.add("hidden");
                weekdayFields.querySelectorAll(".weekday-btn").forEach(b => b.classList.remove("active"));
                intervalFields.classList.remove("hidden");
                weekdayFields.classList.add("hidden");
                fetchTasks();
            } else {
                showToast(data.message || "Błąd", true);
            }
        } catch (err) {
            showToast("Błąd połączenia", true);
        }
    });

    // ─── Fetch tasks ───
    async function fetchTasks() {
        try {
            const resp = await fetch("/api/tasks");
            allTasks = await resp.json();
            renderTasks();
        } catch (err) {
            tasksList.innerHTML = '<div class="loading">Błąd ładowania</div>';
        }
    }

    // ─── Render tasks ───
    function renderTasks() {
        let filtered = allTasks;
        if (currentFilter === "recurring") {
            filtered = allTasks.filter(t => t.is_recurring);
        } else if (currentFilter === "one-time") {
            filtered = allTasks.filter(t => !t.is_recurring);
        }

        if (filtered.length === 0) {
            tasksList.innerHTML = '<div class="empty-state">Brak zadań w tej kategorii</div>';
            return;
        }

        tasksList.innerHTML = "";
        filtered.forEach((task, index) => {
            const el = document.createElement("div");
            el.className = "admin-task";
            el.dataset.taskId = task.id;

            const metaText = buildMetaBadge(task);

            const posInAll = allTasks.findIndex(t => t.id === task.id);
            const isFirst = posInAll === 0;
            const isLast = posInAll === allTasks.length - 1;

            let startInfo = "";
            if (task.start_date) {
                startInfo = ` · <span class="badge schedule">📅 od ${task.start_date}</span>`;
            }
            let endInfo = "";
            if (task.end_date) {
                endInfo = ` · <span class="badge schedule">🏁 do ${task.end_date}</span>`;
            }

            el.innerHTML = `
                <div class="admin-task-order">
                    <button class="btn-order" ${isFirst ? 'disabled' : ''} onclick="moveTask(${task.id}, 'up')" title="Przesuń wyżej">▲</button>
                    <span class="order-num order-clickable" onclick="promptPosition(${task.id}, ${posInAll + 1})" title="Kliknij aby ustawić pozycję">${posInAll + 1}</span>
                    <button class="btn-order" ${isLast ? 'disabled' : ''} onclick="moveTask(${task.id}, 'down')" title="Przesuń niżej">▼</button>
                </div>
                <div class="admin-task-info">
                    <div class="admin-task-title">${escHtml(task.title)}</div>
                    <div class="admin-task-meta">
                        ${metaText}${startInfo}${endInfo}
                        ${task.description ? ' · ' + escHtml(task.description) : ''}
                    </div>
                </div>
                <div class="admin-task-actions">
                    <button class="btn btn-edit" onclick="openEdit(${task.id})">Edytuj</button>
                    <button class="btn btn-danger" onclick="deleteTask(${task.id})">Usuń</button>
                </div>
            `;
            tasksList.appendChild(el);
        });
    }

    function buildMetaBadge(task) {
        if (!task.is_recurring) {
            return '<span class="badge one-time">📌 Jednorazowe</span>';
        }
        const recLabels = { days: "dni", weeks: "tyg.", months: "mies." };
        if (task.recurrence_type === "weekdays" && task.recurrence_days) {
            const dayLabels = task.recurrence_days.split(",")
                .map(d => WEEKDAY_LABELS[d.trim()] || d).join(", ");
            return `<span class="badge recurring">🔄 ${dayLabels}</span>`;
        }
        return `<span class="badge recurring">🔄 Co ${task.recurrence_value} ${recLabels[task.recurrence_type] || ""}</span>`;
    }

    // ─── Set position via prompt ───
    window.promptPosition = async function (taskId, currentPos) {
        const input = prompt(`Obecna pozycja: ${currentPos}\nWpisz nową pozycję (1–${allTasks.length}):`, currentPos);
        if (input === null) return;
        const newPos = parseInt(input);
        if (isNaN(newPos) || newPos < 1 || newPos > allTasks.length) {
            showToast(`Podaj liczbę od 1 do ${allTasks.length}`, true);
            return;
        }
        if (newPos === currentPos) return;
        try {
            const resp = await fetch(`/api/tasks/${taskId}/position`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ position: newPos }),
            });
            if (resp.ok) {
                showToast(`Pozycja zmieniona na ${newPos} ✓`);
                fetchTasks();
            } else {
                showToast("Błąd zmiany pozycji", true);
            }
        } catch (err) {
            showToast("Błąd połączenia", true);
        }
    };

    // ─── Move task up/down ───
    window.moveTask = async function (taskId, direction) {
        const idx = allTasks.findIndex(t => t.id === taskId);
        if (idx === -1) return;

        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= allTasks.length) return;

        [allTasks[idx], allTasks[swapIdx]] = [allTasks[swapIdx], allTasks[idx]];

        const taskIds = allTasks.map(t => t.id);
        try {
            await fetch("/api/tasks/reorder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ task_ids: taskIds }),
            });
            renderTasks();
        } catch (err) {
            showToast("Błąd zmiany kolejności", true);
            fetchTasks();
        }
    };

    // ─── Delete task ───
    window.deleteTask = async function (taskId) {
        if (!confirm("Czy na pewno chcesz usunąć to zadanie?")) return;
        try {
            await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
            showToast("Zadanie usunięte");
            fetchTasks();
        } catch (err) {
            showToast("Błąd", true);
        }
    };

    // ─── Edit modal ───
    window.openEdit = function (taskId) {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;

        document.getElementById("edit-id").value = task.id;
        document.getElementById("edit-title").value = task.title;
        document.getElementById("edit-description").value = task.description || "";
        document.getElementById("edit-start-date").value = task.start_date || "";
        document.getElementById("edit-end-date").value = task.end_date || "";
        document.getElementById("edit-recurrence-value").value = task.recurrence_value || 1;
        document.getElementById("edit-recurrence-type").value = task.recurrence_type || "days";

        const recFields = document.getElementById("edit-recurrence-fields");
        const editIntervalFields = document.getElementById("edit-interval-fields");
        const editWeekdayFieldsEl = document.getElementById("edit-weekday-fields");

        if (task.is_recurring) {
            recFields.classList.remove("hidden");
            if (task.recurrence_type === "weekdays") {
                editIntervalFields.classList.add("hidden");
                editWeekdayFieldsEl.classList.remove("hidden");
                setSelectedWeekdays(editWeekdayFieldsEl, task.recurrence_days);
            } else {
                editIntervalFields.classList.remove("hidden");
                editWeekdayFieldsEl.classList.add("hidden");
            }
        } else {
            recFields.classList.add("hidden");
        }

        editModal.classList.remove("hidden");
    };

    window.closeModal = function () {
        editModal.classList.add("hidden");
    };

    editModal.addEventListener("click", (e) => {
        if (e.target === editModal) closeModal();
    });

    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const taskId = document.getElementById("edit-id").value;
        const recType = document.getElementById("edit-recurrence-type").value;

        const body = {
            title: document.getElementById("edit-title").value.trim(),
            description: document.getElementById("edit-description").value.trim(),
            start_date: document.getElementById("edit-start-date").value || "",
            end_date: document.getElementById("edit-end-date").value || "",
            recurrence_type: recType,
        };

        if (recType === "weekdays") {
            const editWeekdayFieldsEl = document.getElementById("edit-weekday-fields");
            body.recurrence_days = getSelectedWeekdays(editWeekdayFieldsEl);
            if (!body.recurrence_days) {
                showToast("Wybierz przynajmniej jeden dzień", true);
                return;
            }
        } else {
            body.recurrence_value = parseInt(document.getElementById("edit-recurrence-value").value) || 1;
        }

        try {
            const resp = await fetch(`/api/tasks/${taskId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (resp.ok) {
                showToast("Zmiany zapisane ✓");
                closeModal();
                fetchTasks();
            } else {
                showToast("Błąd zapisu", true);
            }
        } catch (err) {
            showToast("Błąd połączenia", true);
        }
    });

    // ─── Toast ───
    function showToast(msg, isError = false) {
        toast.textContent = msg;
        toast.className = "toast" + (isError ? " error" : "");
        setTimeout(() => toast.classList.add("hidden"), 2500);
    }

    // ─── Escape HTML ───
    function escHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Init ───
    fetchTasks();

})();
