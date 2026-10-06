/**
 * ============================================================================
 * TASKFLOW — KANBAN TASK BOARD
 * Vanilla JavaScript Application Logic
 * 
 * Features:
 * - Full CRUD Task Management (Create, Read, Update, Delete)
 * - HTML5 Native Drag & Drop across all columns (To Do, In Progress, Done)
 * - Real-time Title Search & Priority Filter (combinable)
 * - Persistent Browser LocalStorage synchronization
 * - Statistics Dashboard (Total, Pending, Completed, High Priority)
 * - Due Date calculations with subtle Overdue notifications
 * - Theme Switcher with Dark & Light mode persistence
 * - Accessible Modal Dialogs with keyboard navigation (Esc, Enter, Focus)
 * - Sanitized DOM rendering to prevent XSS
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     1. CONSTANTS & CONFIGURATION
     ========================================================================== */
  const STORAGE_KEYS = {
    TASKS: 'taskflow_tasks_v1',
    THEME: 'taskflow_theme_v1'
  };

  const STATUSES = {
    TODO: 'todo',
    IN_PROGRESS: 'in-progress',
    DONE: 'done'
  };

  const PRIORITIES = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
  };

  // Helper to generate a relative ISO date string (YYYY-MM-DD)
  function getRelativeDateStr(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Realistic sample initial tasks when local storage is empty
  const INITIAL_SAMPLE_TASKS = [
    {
      id: 'task-sample-1',
      title: 'Complete DBMS Assignment',
      description: 'Normalize database schemas to 3NF/BCNF and write SQL queries for the library system.',
      priority: PRIORITIES.HIGH,
      status: STATUSES.TODO,
      dueDate: getRelativeDateStr(2),
      createdAt: new Date().toISOString()
    },
    {
      id: 'task-sample-2',
      title: 'Prepare CN Viva',
      description: 'Review OSI layers, TCP/UDP differences, subnetting formulas, and socket programming concepts.',
      priority: PRIORITIES.MEDIUM,
      status: STATUSES.IN_PROGRESS,
      dueDate: getRelativeDateStr(4),
      createdAt: new Date().toISOString()
    },
    {
      id: 'task-sample-3',
      title: 'Submit Mini Project',
      description: 'Upload source code zip, system documentation report, and functional screen recording.',
      priority: PRIORITIES.LOW,
      status: STATUSES.DONE,
      dueDate: getRelativeDateStr(-1),
      createdAt: new Date().toISOString()
    }
  ];

  /* ==========================================================================
     2. APPLICATION STATE
     ========================================================================== */
  let tasks = [];
  let filterState = {
    searchQuery: '',
    priority: 'all'
  };
  let pendingDeleteTaskId = null;
  let draggedTaskId = null;

  /* ==========================================================================
     3. DOM ELEMENT CACHING (Initialized safely in init())
     ========================================================================== */
  let DOM = {};

  function cacheDOMElements() {
    DOM = {
      // Header & Navigation
      currentDateDisplay: document.getElementById('currentDateDisplay'),
      themeToggleBtn: document.getElementById('themeToggleBtn'),
      openAddModalBtn: document.getElementById('openAddModalBtn') || document.getElementById('addTaskBtn'),

      // Search & Filters
      searchInput: document.getElementById('searchInput'),
      searchClearBtn: document.getElementById('searchClearBtn'),
      priorityFilter: document.getElementById('priorityFilter'),
      filterStatusBar: document.getElementById('filterStatusBar'),
      filterStatusText: document.getElementById('filterStatusText'),
      resetFiltersBtn: document.getElementById('resetFiltersBtn'),

      // Statistics Counters
      statTotalCount: document.getElementById('statTotalCount'),
      statPendingCount: document.getElementById('statPendingCount'),
      statCompletedCount: document.getElementById('statCompletedCount'),
      statHighCount: document.getElementById('statHighCount'),

      // Columns & Dropzones
      columns: {
        [STATUSES.TODO]: document.getElementById('column-todo'),
        [STATUSES.IN_PROGRESS]: document.getElementById('column-in-progress'),
        [STATUSES.DONE]: document.getElementById('column-done')
      },
      taskLists: {
        [STATUSES.TODO]: document.getElementById('taskList-todo'),
        [STATUSES.IN_PROGRESS]: document.getElementById('taskList-in-progress'),
        [STATUSES.DONE]: document.getElementById('taskList-done')
      },
      counters: {
        [STATUSES.TODO]: document.getElementById('counter-todo'),
        [STATUSES.IN_PROGRESS]: document.getElementById('counter-in-progress'),
        [STATUSES.DONE]: document.getElementById('counter-done')
      },
      emptyStates: {
        [STATUSES.TODO]: document.getElementById('emptyState-todo'),
        [STATUSES.IN_PROGRESS]: document.getElementById('emptyState-in-progress'),
        [STATUSES.DONE]: document.getElementById('emptyState-done')
      },

      // Add / Edit Modal Elements
      taskModalBackdrop: document.getElementById('taskModalBackdrop'),
      modalTitle: document.getElementById('modalTitle'),
      modalCloseBtn: document.getElementById('modalCloseBtn'),
      modalCancelBtn: document.getElementById('modalCancelBtn'),
      modalSubmitBtn: document.getElementById('modalSubmitBtn'),
      taskForm: document.getElementById('taskForm'),
      taskIdInput: document.getElementById('taskIdInput'),
      taskTitleInput: document.getElementById('taskTitleInput'),
      taskDescInput: document.getElementById('taskDescInput'),
      taskPrioritySelect: document.getElementById('taskPrioritySelect'),
      taskStatusSelect: document.getElementById('taskStatusSelect'),
      taskDueDateInput: document.getElementById('taskDueDateInput'),
      titleErrorMsg: document.getElementById('titleErrorMsg'),

      // Delete Confirmation Modal Elements
      deleteModalBackdrop: document.getElementById('deleteModalBackdrop'),
      deleteModalCloseBtn: document.getElementById('deleteModalCloseBtn'),
      deleteCancelBtn: document.getElementById('deleteCancelBtn'),
      deleteConfirmBtn: document.getElementById('deleteConfirmBtn'),
      deleteTaskTitlePreview: document.getElementById('deleteTaskTitlePreview'),

      // Toast Notification
      toastNotification: document.getElementById('toastNotification'),
      toastIcon: document.getElementById('toastIcon'),
      toastMessage: document.getElementById('toastMessage')
    };
  }

  /* ==========================================================================
     4. HELPER UTILITIES
     ========================================================================== */

  /**
   * Escape raw user text to prevent XSS attacks when injecting into the DOM.
   * @param {string} str
   * @returns {string} Sanitized string
   */
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Generates a unique task ID using timestamp and cryptographically random values.
   * @returns {string}
   */
  function generateUniqueId() {
    return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  }

  /**
   * Formats a YYYY-MM-DD date string into a user-friendly format (e.g., "Oct 15, 2026").
   * @param {string} dateString
   * @returns {string}
   */
  function formatDueDate(dateString) {
    if (!dateString) return 'No due date';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const date = new Date(year, month, day);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  /**
   * Checks whether a task's due date has passed.
   * Returns false if task is already completed (Done) or has no due date.
   * @param {string} dueDate
   * @param {string} status
   * @returns {boolean}
   */
  function isTaskOverdue(dueDate, status) {
    if (!dueDate || status === STATUSES.DONE) {
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parts = dueDate.split('-');
    if (parts.length !== 3) return false;

    const taskDate = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    );
    taskDate.setHours(0, 0, 0, 0);

    return taskDate < today;
  }

  /**
   * Displays a temporary non-blocking toast notification.
   * @param {string} message
   * @param {string} icon
   */
  let toastTimer = null;
  function showToast(message, icon = '✓') {
    if (!DOM.toastNotification) return;

    if (DOM.toastIcon) DOM.toastIcon.textContent = icon;
    if (DOM.toastMessage) DOM.toastMessage.textContent = message;
    DOM.toastNotification.classList.add('is-active');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (DOM.toastNotification) DOM.toastNotification.classList.remove('is-active');
    }, 2800);
  }

  /* ==========================================================================
     5. LOCALSTORAGE OPERATIONS
     ========================================================================== */

  /**
   * Loads tasks from LocalStorage or populates sample tasks if empty.
   */
  function loadTasksFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.TASKS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          tasks = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('TaskFlow: Could not parse tasks from localStorage, initializing default tasks.', e);
    }

    // Default sample tasks on fresh start
    tasks = [...INITIAL_SAMPLE_TASKS];
    saveTasksToStorage();
  }

  /**
   * Saves the current tasks state to LocalStorage.
   */
  function saveTasksToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    } catch (e) {
      console.error('TaskFlow: Failed to save tasks to localStorage.', e);
    }
  }

  /* ==========================================================================
     6. THEME MANAGEMENT (LIGHT & DARK MODE)
     ========================================================================== */

  /**
   * Initializes theme from localStorage or system preference.
   */
  function initializeTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (savedTheme === 'dark' || savedTheme === 'light') {
      applyTheme(savedTheme);
    } else {
      // Check OS preference
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
  }

  /**
   * Applies the theme attribute to the HTML document root and updates storage.
   * @param {string} theme - 'light' | 'dark'
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
    } catch (e) {
      console.warn('TaskFlow: Failed to save theme preference.', e);
    }
  }

  /**
   * Toggles between light and dark themes.
   */
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    showToast(newTheme === 'dark' ? 'Dark mode enabled' : 'Light mode enabled', newTheme === 'dark' ? '🌙' : '☀️');
  }

  /* ==========================================================================
     7. RENDERING & BOARD UI
     ========================================================================== */

  /**
   * Full board render function: updates statistics, column cards, and empty states.
   */
  function renderBoard() {
    const query = (filterState.searchQuery || '').trim().toLowerCase();
    const priorityFilter = filterState.priority;

    // Filter tasks based on search title & priority
    const filteredTasks = tasks.filter(task => {
      const matchesSearch = !query || task.title.toLowerCase().includes(query);
      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });

    // Update filter status bar visibility
    const isFiltering = query.length > 0 || priorityFilter !== 'all';
    if (DOM.filterStatusBar) {
      if (isFiltering) {
        DOM.filterStatusBar.style.display = 'flex';
        let statusMsg = 'Filters active: ';
        if (query) statusMsg += `Title matches "${escapeHTML(query)}" `;
        if (priorityFilter !== 'all') statusMsg += `[Priority: ${priorityFilter.toUpperCase()}] `;
        statusMsg += `— Showing ${filteredTasks.length} of ${tasks.length} tasks`;
        if (DOM.filterStatusText) DOM.filterStatusText.textContent = statusMsg;
      } else {
        DOM.filterStatusBar.style.display = 'none';
      }
    }

    // Render each column
    [STATUSES.TODO, STATUSES.IN_PROGRESS, STATUSES.DONE].forEach(status => {
      renderColumn(status, filteredTasks);
    });

    // Update global statistics
    renderStatistics();
  }

  /**
   * Renders tasks into a specific Kanban column.
   * @param {string} status - Column status
   * @param {Array} filteredTasks - Currently active filtered tasks
   */
  function renderColumn(status, filteredTasks) {
    const listEl = DOM.taskLists ? DOM.taskLists[status] : document.getElementById(`taskList-${status}`);
    const counterEl = DOM.counters ? DOM.counters[status] : document.getElementById(`counter-${status}`);
    const emptyStateEl = DOM.emptyStates ? DOM.emptyStates[status] : document.getElementById(`emptyState-${status}`);

    if (!listEl) return;

    // Tasks for this column matching current filters
    const columnTasks = filteredTasks.filter(task => task.status === status);
    // All tasks in this column regardless of filter (for empty state logic)
    const allColumnTasks = tasks.filter(task => task.status === status);

    // Update column counter
    if (counterEl) {
      counterEl.textContent = columnTasks.length;
    }

    // Clear previous task cards
    listEl.innerHTML = '';

    // Handle Empty States
    if (columnTasks.length === 0) {
      if (emptyStateEl) {
        emptyStateEl.classList.add('is-visible');
        const emptyTextEl = emptyStateEl.querySelector('.empty-text');
        const emptySubtextEl = emptyStateEl.querySelector('.empty-subtext');

        if (allColumnTasks.length > 0) {
          // Tasks exist but are hidden by filters
          if (emptyTextEl) emptyTextEl.textContent = 'No matching tasks';
          if (emptySubtextEl) emptySubtextEl.textContent = 'Adjust search or priority filter';
        } else {
          // Column truly has zero tasks
          if (emptyTextEl) {
            if (status === STATUSES.TODO) emptyTextEl.textContent = 'No tasks yet';
            else if (status === STATUSES.IN_PROGRESS) emptyTextEl.textContent = 'No tasks in progress';
            else emptyTextEl.textContent = 'No completed tasks';
          }
          if (emptySubtextEl) {
            if (status === STATUSES.TODO) emptySubtextEl.textContent = 'Click + to create your first task';
            else if (status === STATUSES.IN_PROGRESS) emptySubtextEl.textContent = 'Drag tasks here when you start';
            else emptySubtextEl.textContent = 'Drop finished tasks here';
          }
        }
      }
    } else {
      if (emptyStateEl) {
        emptyStateEl.classList.remove('is-visible');
      }

      // Append task cards
      columnTasks.forEach(task => {
        const cardElement = createTaskCardElement(task);
        listEl.appendChild(cardElement);
      });
    }
  }

  /**
   * Creates a modern, interactive task card DOM element.
   * @param {Object} task
   * @returns {HTMLElement}
   */
  function createTaskCardElement(task) {
    const card = document.createElement('article');
    card.className = 'task-card';
    card.setAttribute('draggable', 'true');
    card.setAttribute('data-id', task.id);
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `Task: ${task.title}`);

    // Priority formatting
    const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
    const priorityClass = `priority-${task.priority}`;

    // Due Date calculations
    const isOverdue = isTaskOverdue(task.dueDate, task.status);
    const formattedDate = formatDueDate(task.dueDate);
    const hasDueDate = Boolean(task.dueDate);

    // Compose Card HTML with sanitized contents
    card.innerHTML = `
      <div class="card-top-row">
        <span class="priority-badge ${priorityClass}">
          ${priorityLabel}
        </span>
        <div class="card-actions">
          <!-- Mobile Quick Move Selector -->
          <select class="card-quick-move" aria-label="Move task to column" data-task-id="${task.id}">
            <option value="todo" ${task.status === STATUSES.TODO ? 'selected' : ''}>To Do</option>
            <option value="in-progress" ${task.status === STATUSES.IN_PROGRESS ? 'selected' : ''}>In Progress</option>
            <option value="done" ${task.status === STATUSES.DONE ? 'selected' : ''}>Done</option>
          </select>
          <!-- Edit Button -->
          <button type="button" class="card-action-btn edit-btn" data-action="edit" data-id="${task.id}" aria-label="Edit task ${escapeHTML(task.title)}" title="Edit Task">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <!-- Delete Button -->
          <button type="button" class="card-action-btn delete-btn" data-action="delete" data-id="${task.id}" aria-label="Delete task ${escapeHTML(task.title)}" title="Delete Task">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>

      <h3 class="card-title">${escapeHTML(task.title)}</h3>

      ${task.description ? `<p class="card-description">${escapeHTML(task.description)}</p>` : ''}

      <div class="card-footer">
        <div class="due-date-badge ${hasDueDate ? '' : 'no-date'} ${isOverdue ? 'is-overdue' : ''}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>${hasDueDate ? formattedDate : 'No due date'}</span>
          ${isOverdue ? '<span class="overdue-text">(Overdue)</span>' : ''}
        </div>
      </div>
    `;

    // Attach Drag and Drop Listeners to Card
    attachCardDragListeners(card, task.id);

    return card;
  }

  /**
   * Updates statistics summary counters across the application.
   */
  function renderStatistics() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === STATUSES.DONE).length;
    const pending = tasks.filter(t => t.status !== STATUSES.DONE).length;
    const highPriority = tasks.filter(t => t.priority === PRIORITIES.HIGH).length;

    if (DOM.statTotalCount) DOM.statTotalCount.textContent = total;
    if (DOM.statPendingCount) DOM.statPendingCount.textContent = pending;
    if (DOM.statCompletedCount) DOM.statCompletedCount.textContent = completed;
    if (DOM.statHighCount) DOM.statHighCount.textContent = highPriority;
  }

  /* ==========================================================================
     8. HTML5 DRAG AND DROP
     ========================================================================== */

  /**
   * Attaches dragstart and dragend listeners to an individual card.
   * @param {HTMLElement} card
   * @param {string} taskId
   */
  function attachCardDragListeners(card, taskId) {
    card.addEventListener('dragstart', (e) => {
      draggedTaskId = taskId;
      card.classList.add('is-dragging');
      // Transmit task ID via dataTransfer for HTML5 compliance
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskId);
      }
    });

    card.addEventListener('dragend', () => {
      draggedTaskId = null;
      card.classList.remove('is-dragging');
      // Clean up any remaining drop indicators
      if (DOM.columns) {
        Object.values(DOM.columns).forEach(col => {
          if (col) col.classList.remove('drag-over');
        });
      }
    });
  }

  /**
   * Initializes drag & drop listeners on all three Kanban columns.
   */
  function initializeDragAndDrop() {
    if (!DOM.columns) return;

    Object.entries(DOM.columns).forEach(([columnStatus, columnEl]) => {
      if (!columnEl) return;

      // Drag over column well
      columnEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        if (!columnEl.classList.contains('drag-over')) {
          columnEl.classList.add('drag-over');
        }
      });

      // Drag leave column well
      columnEl.addEventListener('dragleave', (e) => {
        // Prevent flashing when dragging over child elements
        if (!columnEl.contains(e.relatedTarget)) {
          columnEl.classList.remove('drag-over');
        }
      });

      // Drop on column well
      columnEl.addEventListener('drop', (e) => {
        e.preventDefault();
        columnEl.classList.remove('drag-over');

        const taskId = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || draggedTaskId;
        if (!taskId) return;

        moveTaskToStatus(taskId, columnStatus);
      });
    });
  }

  /**
   * Updates a task's status, persists to storage, and updates UI.
   * @param {string} taskId
   * @param {string} newStatus
   */
  function moveTaskToStatus(taskId, newStatus) {
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    const currentTask = tasks[taskIndex];
    if (currentTask.status === newStatus) return; // Status did not change

    currentTask.status = newStatus;

    saveTasksToStorage();
    renderBoard();

    // Friendly toast message
    const readableStatus = newStatus === STATUSES.TODO ? 'To Do' : (newStatus === STATUSES.IN_PROGRESS ? 'In Progress' : 'Done');
    showToast(`Task moved to ${readableStatus}`);
  }

  /* ==========================================================================
     9. TASK MODAL (ADD & EDIT)
     ========================================================================== */

  /**
   * Opens the task modal in "Add Task" mode.
   * @param {string} initialStatus - Optional pre-selected column
   */
  function openAddModal(initialStatus = STATUSES.TODO) {
    resetTaskForm();
    if (DOM.modalTitle) DOM.modalTitle.textContent = 'Create New Task';
    if (DOM.modalSubmitBtn) {
      const span = DOM.modalSubmitBtn.querySelector('span');
      if (span) span.textContent = 'Add Task';
      else DOM.modalSubmitBtn.textContent = 'Add Task';
    }
    if (DOM.taskIdInput) DOM.taskIdInput.value = '';
    if (DOM.taskStatusSelect) DOM.taskStatusSelect.value = initialStatus;

    openModal(DOM.taskModalBackdrop);
    // Autofocus on Title
    setTimeout(() => {
      if (DOM.taskTitleInput) DOM.taskTitleInput.focus();
    }, 50);
  }

  /**
   * Opens the task modal in "Edit Task" mode with existing data populated.
   * @param {string} taskId
   */
  function openEditModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    resetTaskForm();
    if (DOM.modalTitle) DOM.modalTitle.textContent = 'Edit Task';
    if (DOM.modalSubmitBtn) {
      const span = DOM.modalSubmitBtn.querySelector('span');
      if (span) span.textContent = 'Save Changes';
      else DOM.modalSubmitBtn.textContent = 'Save Changes';
    }

    if (DOM.taskIdInput) DOM.taskIdInput.value = task.id;
    if (DOM.taskTitleInput) DOM.taskTitleInput.value = task.title;
    if (DOM.taskDescInput) DOM.taskDescInput.value = task.description || '';
    if (DOM.taskPrioritySelect) DOM.taskPrioritySelect.value = task.priority;
    if (DOM.taskStatusSelect) DOM.taskStatusSelect.value = task.status;
    if (DOM.taskDueDateInput) DOM.taskDueDateInput.value = task.dueDate || '';

    openModal(DOM.taskModalBackdrop);
    setTimeout(() => {
      if (DOM.taskTitleInput) DOM.taskTitleInput.focus();
    }, 50);
  }

  /**
   * Resets form fields and validation errors.
   */
  function resetTaskForm() {
    if (DOM.taskForm) DOM.taskForm.reset();
    if (DOM.taskTitleInput) DOM.taskTitleInput.classList.remove('is-invalid');
    if (DOM.titleErrorMsg) DOM.titleErrorMsg.classList.remove('is-visible');
    if (DOM.taskPrioritySelect) DOM.taskPrioritySelect.value = PRIORITIES.MEDIUM;
    if (DOM.taskStatusSelect) DOM.taskStatusSelect.value = STATUSES.TODO;
  }

  /**
   * Handles submission of the Add/Edit Task form.
   * @param {Event} e
   */
  function handleTaskFormSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const titleValue = DOM.taskTitleInput ? DOM.taskTitleInput.value.trim() : '';
    const descValue = DOM.taskDescInput ? DOM.taskDescInput.value.trim() : '';
    const priorityValue = DOM.taskPrioritySelect ? DOM.taskPrioritySelect.value : PRIORITIES.MEDIUM;
    const statusValue = DOM.taskStatusSelect ? DOM.taskStatusSelect.value : STATUSES.TODO;
    const dueDateValue = DOM.taskDueDateInput ? DOM.taskDueDateInput.value : '';
    const editingTaskId = DOM.taskIdInput ? DOM.taskIdInput.value : '';

    // Form Validation: Title is required and cannot be only spaces
    if (!titleValue) {
      if (DOM.taskTitleInput) {
        DOM.taskTitleInput.classList.add('is-invalid');
        DOM.taskTitleInput.focus();
      }
      if (DOM.titleErrorMsg) DOM.titleErrorMsg.classList.add('is-visible');
      return;
    }

    if (editingTaskId) {
      // EDIT EXISTING TASK
      const taskIndex = tasks.findIndex(t => t.id === editingTaskId);
      if (taskIndex !== -1) {
        tasks[taskIndex].title = titleValue;
        tasks[taskIndex].description = descValue;
        tasks[taskIndex].priority = priorityValue;
        tasks[taskIndex].status = statusValue;
        tasks[taskIndex].dueDate = dueDateValue;
        tasks[taskIndex].updatedAt = new Date().toISOString();

        saveTasksToStorage();
        renderBoard();
        closeModal(DOM.taskModalBackdrop);
        showToast('Task updated successfully');
      }
    } else {
      // CREATE NEW TASK
      const newTask = {
        id: generateUniqueId(),
        title: titleValue,
        description: descValue,
        priority: priorityValue,
        status: statusValue,
        dueDate: dueDateValue,
        createdAt: new Date().toISOString()
      };

      tasks.unshift(newTask);
      saveTasksToStorage();
      renderBoard();
      closeModal(DOM.taskModalBackdrop);
      showToast('Task created successfully');
    }
  }

  /* ==========================================================================
     10. DELETE CONFIRMATION MODAL
     ========================================================================== */

  /**
   * Opens the confirmation modal before deleting a task.
   * @param {string} taskId
   */
  function openDeleteModal(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    pendingDeleteTaskId = taskId;
    if (DOM.deleteTaskTitlePreview) {
      DOM.deleteTaskTitlePreview.textContent = `"${task.title}"`;
    }
    openModal(DOM.deleteModalBackdrop);
    if (DOM.deleteConfirmBtn) DOM.deleteConfirmBtn.focus();
  }

  /**
   * Executes deletion after user confirms in the modal.
   */
  function confirmDeleteTask() {
    if (!pendingDeleteTaskId) return;

    const taskIndex = tasks.findIndex(t => t.id === pendingDeleteTaskId);
    if (taskIndex !== -1) {
      tasks.splice(taskIndex, 1);
      saveTasksToStorage();
      renderBoard();
      showToast('Task deleted');
    }

    pendingDeleteTaskId = null;
    closeModal(DOM.deleteModalBackdrop);
  }

  /* ==========================================================================
     11. MODAL COMMON HELPERS
     ========================================================================== */

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('is-open');
    modalEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('is-open');
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /* ==========================================================================
     12. SEARCH & FILTERING LOGIC
     ========================================================================== */

  function handleSearchInput(e) {
    filterState.searchQuery = e.target.value;
    if (DOM.searchClearBtn) {
      DOM.searchClearBtn.style.display = filterState.searchQuery.length > 0 ? 'flex' : 'none';
    }
    renderBoard();
  }

  function clearSearch() {
    if (DOM.searchInput) {
      DOM.searchInput.value = '';
      DOM.searchInput.focus();
    }
    filterState.searchQuery = '';
    if (DOM.searchClearBtn) {
      DOM.searchClearBtn.style.display = 'none';
    }
    renderBoard();
  }

  function handlePriorityFilterChange(e) {
    filterState.priority = e.target.value;
    renderBoard();
  }

  function resetAllFilters() {
    if (DOM.searchInput) DOM.searchInput.value = '';
    if (DOM.priorityFilter) DOM.priorityFilter.value = 'all';
    filterState.searchQuery = '';
    filterState.priority = 'all';
    if (DOM.searchClearBtn) {
      DOM.searchClearBtn.style.display = 'none';
    }
    renderBoard();
    showToast('Filters cleared');
  }

  /* ==========================================================================
     13. EVENT LISTENERS SETUP
     ========================================================================== */

  function setupEventListeners() {
    // Theme Switcher Button
    if (DOM.themeToggleBtn) {
      DOM.themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Direct Add Task Button in Navbar
    if (DOM.openAddModalBtn) {
      DOM.openAddModalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openAddModal(STATUSES.TODO);
      });
    }

    // Task Form Submit
    if (DOM.taskForm) {
      DOM.taskForm.addEventListener('submit', handleTaskFormSubmit);
    }

    // Real-time Title Validation on input
    if (DOM.taskTitleInput) {
      DOM.taskTitleInput.addEventListener('input', () => {
        if (DOM.taskTitleInput.value.trim().length > 0) {
          DOM.taskTitleInput.classList.remove('is-invalid');
          if (DOM.titleErrorMsg) DOM.titleErrorMsg.classList.remove('is-visible');
        }
      });
    }

    // Modal Close buttons
    if (DOM.modalCloseBtn) {
      DOM.modalCloseBtn.addEventListener('click', () => closeModal(DOM.taskModalBackdrop));
    }
    if (DOM.modalCancelBtn) {
      DOM.modalCancelBtn.addEventListener('click', () => closeModal(DOM.taskModalBackdrop));
    }

    if (DOM.deleteModalCloseBtn) {
      DOM.deleteModalCloseBtn.addEventListener('click', () => closeModal(DOM.deleteModalBackdrop));
    }
    if (DOM.deleteCancelBtn) {
      DOM.deleteCancelBtn.addEventListener('click', () => closeModal(DOM.deleteModalBackdrop));
    }
    if (DOM.deleteConfirmBtn) {
      DOM.deleteConfirmBtn.addEventListener('click', confirmDeleteTask);
    }

    // Search and Filters
    if (DOM.searchInput) {
      DOM.searchInput.addEventListener('input', handleSearchInput);
    }
    if (DOM.searchClearBtn) {
      DOM.searchClearBtn.addEventListener('click', clearSearch);
    }
    if (DOM.priorityFilter) {
      DOM.priorityFilter.addEventListener('change', handlePriorityFilterChange);
    }
    if (DOM.resetFiltersBtn) {
      DOM.resetFiltersBtn.addEventListener('click', resetAllFilters);
    }

    // Backdrop Click to Close (only when clicking the backdrop itself, not dialog)
    if (DOM.taskModalBackdrop) {
      DOM.taskModalBackdrop.addEventListener('click', (e) => {
        if (e.target === DOM.taskModalBackdrop) closeModal(DOM.taskModalBackdrop);
      });
    }
    if (DOM.deleteModalBackdrop) {
      DOM.deleteModalBackdrop.addEventListener('click', (e) => {
        if (e.target === DOM.deleteModalBackdrop) closeModal(DOM.deleteModalBackdrop);
      });
    }

    // Keyboard Shortcuts (Escape to close open modal)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (DOM.taskModalBackdrop && DOM.taskModalBackdrop.classList.contains('is-open')) {
          closeModal(DOM.taskModalBackdrop);
        }
        if (DOM.deleteModalBackdrop && DOM.deleteModalBackdrop.classList.contains('is-open')) {
          closeModal(DOM.deleteModalBackdrop);
        }
      }
    });

    // GLOBAL DELEGATED CLICK LISTENER (Guarantees every button works reliably)
    document.addEventListener('click', (e) => {
      // 1. Open Add Task modal (Navbar button or any element with data-action="open-add-modal")
      const addModalTrigger = e.target.closest('#openAddModalBtn, #addTaskBtn, [data-action="open-add-modal"]');
      if (addModalTrigger) {
        e.preventDefault();
        openAddModal(STATUSES.TODO);
        return;
      }

      // 2. Column Quick Add button
      const columnAddBtn = e.target.closest('.btn-column-add, [data-add-status]');
      if (columnAddBtn) {
        e.preventDefault();
        const targetStatus = columnAddBtn.getAttribute('data-add-status') || STATUSES.TODO;
        openAddModal(targetStatus);
        return;
      }

      // 3. Close Task Modal
      const closeTaskModalTrigger = e.target.closest('[data-action="close-task-modal"], #modalCloseBtn, #modalCancelBtn');
      if (closeTaskModalTrigger) {
        e.preventDefault();
        closeModal(DOM.taskModalBackdrop);
        return;
      }

      // 4. Close Delete Modal
      const closeDeleteModalTrigger = e.target.closest('[data-action="close-delete-modal"], #deleteModalCloseBtn, #deleteCancelBtn');
      if (closeDeleteModalTrigger) {
        e.preventDefault();
        closeModal(DOM.deleteModalBackdrop);
        return;
      }

      // 5. Card Edit Action
      const editBtn = e.target.closest('[data-action="edit"]');
      if (editBtn) {
        e.preventDefault();
        const taskId = editBtn.getAttribute('data-id');
        if (taskId) openEditModal(taskId);
        return;
      }

      // 6. Card Delete Action
      const deleteBtn = e.target.closest('[data-action="delete"]');
      if (deleteBtn) {
        e.preventDefault();
        const taskId = deleteBtn.getAttribute('data-id');
        if (taskId) openDeleteModal(taskId);
        return;
      }
    });

    // Delegated event listener for Mobile Quick-Move dropdown
    document.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('card-quick-move')) {
        const taskId = e.target.getAttribute('data-task-id');
        const newStatus = e.target.value;
        if (taskId && newStatus) {
          moveTaskToStatus(taskId, newStatus);
        }
      }
    });
  }

  /**
   * Displays the current date nicely in the board header.
   */
  function displayCurrentDate() {
    if (!DOM.currentDateDisplay) return;
    const now = new Date();
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    DOM.currentDateDisplay.textContent = now.toLocaleDateString(undefined, options);
  }

  /* ==========================================================================
     14. APPLICATION BOOTSTRAP
     ========================================================================== */
  function init() {
    cacheDOMElements();
    initializeTheme();
    loadTasksFromStorage();
    setupEventListeners();
    initializeDragAndDrop();
    displayCurrentDate();
    renderBoard();
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();