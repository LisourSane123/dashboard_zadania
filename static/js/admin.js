// ════════════════════════════════════════════════
//  Admin Panel – Task Management
// ════════════════════════════════════════════════

(function () {
    "use strict";

    let currentFilter = "all";
    let allTasks = [];

    // ─── DOM refs ───
    const addForm = document.getElementById("add-form");
    const isRecurring = document.getElementById("is-recurring");
    const recurrenceFields = document.getElementById("recurrence-fields");
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

    // ─── Add task ───
    addForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = document.getElementById("title").value.trim();
        const description = document.getElementById("description").value.trim();
        const recurring = isRecurring.checked;
        const recurrenceType = document.getElementById("recurrence-type").value;
        const recurrenceValue = parseInt(document.getElementById("recurrence-value").value) || 1;

        if (!title) return;

        const body = {
            title,
            description,
            is_recurring: recurring,
        };

        if (recurring) {
            body.recurrence_type = recurrenceType;
            body.recurrence_value = recurrenceValue;
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
        filtered.forEach(task => {
            const el = document.createElement("div");
            el.className = "admin-task";

            const recLabels = { days: "dni", weeks: "tyg.", months: "mies." };
            const metaText = task.is_recurring
                ? `<span class="badge recurring">🔄 Co ${task.recurrence_value} ${recLabels[task.recurrence_type] || ""}</span>`
                : `<span class="badge one-time">📌 Jednorazowe</span>`;

            el.innerHTML = `
                <div class="admin-task-info">
                    <div class="admin-task-title">${escHtml(task.title)}</div>
                    <div class="admin-task-meta">
                        ${metaText}
                        ${task.description ? ' · ' + escHtml(task.description) : ''}
                    </div>
                </div>
                <div class="admin-task-actions">
                    ${task.is_recurring ? `<button class="btn btn-edit" onclick="openEdit(${task.id})">Edytuj</button>` : ''}
                    <button class="btn btn-danger" onclick="deleteTask(${task.id})">Usuń</button>
                </div>
            `;
            tasksList.appendChild(el);
        });
    }

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
        document.getElementById("edit-recurrence-value").value = task.recurrence_value || 1;
        document.getElementById("edit-recurrence-type").value = task.recurrence_type || "days";

        const recFields = document.getElementById("edit-recurrence-fields");
        if (task.is_recurring) {
            recFields.classList.remove("hidden");
        } else {
            recFields.classList.add("hidden");
        }

        editModal.classList.remove("hidden");
    };

    window.closeModal = function () {
        editModal.classList.add("hidden");
    };

    // Close modal on background click
    editModal.addEventListener("click", (e) => {
        if (e.target === editModal) closeModal();
    });

    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const taskId = document.getElementById("edit-id").value;
        const body = {
            title: document.getElementById("edit-title").value.trim(),
            description: document.getElementById("edit-description").value.trim(),
            recurrence_type: document.getElementById("edit-recurrence-type").value,
            recurrence_value: parseInt(document.getElementById("edit-recurrence-value").value) || 1,
        };

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
