/**
 * NEXUS CORE — Application Logic & State Store
 * Phase 1 + Cloudflare Workers Gateway Integration
 */

const STORAGE_KEY = 'nexus_core_state_v1';
const AUTH_TOKEN_KEY = 'nexus_auth_token_v1';
const GATEWAY_URL_KEY = 'nexus_gateway_url_v1';

// ==========================================
// 1. CLOUDFLARE WORKERS BACKEND CLIENT
// ==========================================
class NexusBackendClient {
  constructor() {
    this.baseUrl = this.loadBaseUrl();
    this.token = localStorage.getItem(AUTH_TOKEN_KEY) || null;
    this.currentUser = null;
  }

  loadBaseUrl() {
    // 1. config.js (Render ビルド時に注入)
    if (typeof window !== 'undefined' && window.__NEXUS_CONFIG__ && window.__NEXUS_CONFIG__.API_BASE_URL) {
      return window.__NEXUS_CONFIG__.API_BASE_URL.replace(/\/$/, '');
    }
    // 2. localStorage
    const saved = localStorage.getItem(GATEWAY_URL_KEY);
    if (saved) return saved.replace(/\/$/, '');
    // 3. デフォルトフォールバック
    return 'https://nexus.liushengluntailang.workers.dev';
  }

  setBaseUrl(url) {
    this.baseUrl = url.trim().replace(/\/$/, '');
    localStorage.setItem(GATEWAY_URL_KEY, this.baseUrl);
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Request failed`);
    }
    return data;
  }

  // API Methods
  async checkHealth() {
    return this.request('/api/health');
  }

  async signUp(email, password) {
    return this.request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.access_token);
    this.currentUser = data.user;
    return data;
  }

  async logout() {
    try {
      if (this.token) {
        await this.request('/api/auth/logout', { method: 'POST' });
      }
    } finally {
      this.setToken(null);
      this.currentUser = null;
    }
  }

  async checkSession() {
    if (!this.token) {
      this.currentUser = null;
      return null;
    }
    try {
      const data = await this.request('/api/auth/user');
      this.currentUser = data.user;
      return this.currentUser;
    } catch (e) {
      this.setToken(null);
      this.currentUser = null;
      return null;
    }
  }

  async fetchProjects() {
    const list = await this.request('/api/projects');
    return list.map(item => ({
      id: item.id,
      name: item.name,
      type: item.project_data?.type || 'GAME',
      desc: item.description || '',
      created: new Date(item.created_at).toLocaleDateString(),
      updated_at: item.updated_at,
      project_data: item.project_data,
      isCloud: true
    }));
  }

  async createProject(project) {
    const payload = {
      name: project.name,
      description: project.desc,
      project_data: {
        type: project.type,
        internalId: project.id,
        files: project.project_data?.files || []
      }
    };
    const created = await this.request('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return {
      id: created.id,
      name: created.name,
      type: created.project_data?.type || 'GAME',
      desc: created.description || '',
      created: new Date(created.created_at).toLocaleDateString(),
      updated_at: created.updated_at,
      project_data: created.project_data,
      isCloud: true
    };
  }

  async saveProject(project) {
    const payload = {
      name: project.name,
      description: project.desc,
      project_data: {
        type: project.type,
        files: project.project_data?.files || [],
        savedAt: new Date().toISOString()
      }
    };
    return this.request(`/api/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async deleteProject(projectId) {
    return this.request(`/api/projects/${projectId}`, {
      method: 'DELETE'
    });
  }
}

// ==========================================
// 2. STATE STORE
// ==========================================
class NexusStore {
  constructor() {
    this.state = this.loadState() || {
      projects: [],
      activeProjectId: null,
      tasks: [],
      activityLogs: [],
      pendingApprovals: []
    };
    this.cloudProjects = [];
  }

  loadState() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to write to localStorage', e);
    }
  }

  getAllProjects(isCloudAuthenticated = false) {
    if (isCloudAuthenticated) {
      return this.cloudProjects;
    }
    return this.state.projects;
  }

  addLocalProject(project) {
    this.state.projects.unshift(project);
    this.setActiveProject(project.id);
    this.logActivity('Human', `ローカルプロジェクト [${project.name}] (${project.type} STUDIO) を作成しました。`);
    this.saveState();
  }

  removeProject(id, isCloudAuthenticated = false) {
    if (isCloudAuthenticated) {
      this.cloudProjects = this.cloudProjects.filter(p => p.id !== id);
    } else {
      this.state.projects = this.state.projects.filter(p => p.id !== id);
      this.saveState();
    }
    if (this.state.activeProjectId === id) {
      this.state.activeProjectId = null;
      this.saveState();
    }
  }

  setActiveProject(id) {
    this.state.activeProjectId = id;
    this.saveState();
  }

  getActiveProject(isCloudAuthenticated = false) {
    const list = this.getAllProjects(isCloudAuthenticated);
    return list.find(p => p.id === this.state.activeProjectId) || this.state.projects.find(p => p.id === this.state.activeProjectId) || null;
  }

  addTask(task) {
    this.state.tasks.push(task);
    this.logActivity('Architect', `新規タスクを作成: "${task.title}" (割当: ${task.assignee})`);
    this.saveState();
  }

  updateTaskStatus(taskId, newStatus) {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = newStatus;
      this.logActivity(task.assignee, `タスク "${task.title}" のステータスを [${newStatus}] に更新しました。`);
      this.saveState();
    }
  }

  queueApproval(approval) {
    this.state.pendingApprovals.push(approval);
    this.logActivity(approval.agent, `承認リクエストを送信: ${approval.title} (${approval.targetFile})`);
    this.saveState();
  }

  resolveApproval(approvalId, approved) {
    const idx = this.state.pendingApprovals.findIndex(a => a.id === approvalId);
    if (idx !== -1) {
      const item = this.state.pendingApprovals[idx];
      this.state.pendingApprovals.splice(idx, 1);
      this.logActivity('Human Gate', `リクエスト [${item.title}] を ${approved ? '承認 (Applied)' : '却下 (Rejected)'} しました。`);
      this.saveState();
      return item;
    }
    return null;
  }

  logActivity(agent, message) {
    const entry = {
      id: 'log_' + Date.now() + Math.random().toString(36).substr(2, 4),
      time: new Date().toLocaleTimeString(),
      agent,
      message
    };
    this.state.activityLogs.unshift(entry);
    if (this.state.activityLogs.length > 50) this.state.activityLogs.pop();
    this.saveState();
  }
}

// ==========================================
// 3. MAIN UI APP CONTROLLER
// ==========================================
class NexusApp {
  constructor() {
    this.store = new NexusStore();
    this.backend = new NexusBackendClient();
    this.currentView = 'dashboard';
    this.authMode = 'login';

    this.initElements();
    this.bindEvents();
    this.seedInitialDataIfEmpty();
    this.initSession();
    this.render();
  }

  initElements() {
    this.views = {
      dashboard: document.getElementById('view-dashboard'),
      projects: document.getElementById('view-projects'),
      workspace: document.getElementById('view-workspace'),
      tasks: document.getElementById('view-tasks'),
      agents: document.getElementById('view-agents'),
    };
    this.navItems = document.querySelectorAll('.nav-item');

    this.createModal = document.getElementById('modal-create-project');
    this.gateModal = document.getElementById('modal-approval-gate');
    this.configModal = document.getElementById('modal-supabase-config');
    this.authModal = document.getElementById('modal-auth');
    this.toastEl = document.getElementById('toast');

    this.authActionsContainer = document.getElementById('auth-actions-container');
    this.userDisplayEmail = document.getElementById('user-display-email');
    this.userSyncStatus = document.getElementById('user-sync-status');
    this.cloudStatusDot = document.getElementById('cloud-status-dot');
    this.cloudStatusText = document.getElementById('cloud-status-text');
    this.statCloudMode = document.getElementById('stat-cloud-mode');
    this.btnSaveCurrentProj = document.getElementById('btn-save-current-proj');
  }

  bindEvents() {
    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        this.switchView(item.dataset.view);
      });
    });

    document.getElementById('btn-quick-new-proj').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btn-open-create-modal').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btn-close-proj-modal').addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-cancel-proj').addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-submit-proj').addEventListener('click', () => this.handleCreateProjectSubmit());
    document.getElementById('btn-refresh-projects').addEventListener('click', () => this.syncProjects());
    this.btnSaveCurrentProj.addEventListener('click', () => this.handleSaveCurrentProject());

    document.getElementById('btn-add-task').addEventListener('click', () => this.promptCreateTask());
    document.getElementById('btn-emergency-stop').addEventListener('click', () => {
      this.store.logActivity('Human', 'EMERGENCY STOP TRIGGERED: すべてのエージェント処理を安全に停止しました。');
      this.showToast('All agents paused immediately.');
      this.render();
    });

    document.getElementById('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleChatSubmit();
    });

    document.getElementById('gate-btn-approve').addEventListener('click', () => this.handleGateDecision(true));
    document.getElementById('gate-btn-reject').addEventListener('click', () => this.handleGateDecision(false));

    document.getElementById('btn-open-config-modal').addEventListener('click', () => this.openConfigModal());
    document.getElementById('btn-close-config-modal').addEventListener('click', () => this.closeConfigModal());
    document.getElementById('btn-save-config').addEventListener('click', () => this.handleSaveConfig());
    document.getElementById('btn-test-gateway').addEventListener('click', () => this.testGatewayHealth());

    document.getElementById('btn-open-auth-modal').addEventListener('click', () => this.openAuthModal('login'));
    document.getElementById('btn-close-auth-modal').addEventListener('click', () => this.closeAuthModal());
    document.getElementById('tab-btn-login').addEventListener('click', () => this.switchAuthTab('login'));
    document.getElementById('tab-btn-signup').addEventListener('click', () => this.switchAuthTab('signup'));
    document.getElementById('auth-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAuthSubmit();
    });
  }

  async initSession() {
    try {
      const user = await this.backend.checkSession();
      if (user) {
        this.store.logActivity('Cloudflare', `セッション復元: ${user.email}`);
        await this.syncProjects();
      }
    } catch (err) {
      console.warn('Session check failed:', err.message);
    }
    this.render();
  }

  async syncProjects() {
    if (this.backend.currentUser) {
      try {
        const cloudList = await this.backend.fetchProjects();
        this.store.cloudProjects = cloudList;
        this.showToast('Cloudflare経由でプロジェクトを同期しました');
      } catch (err) {
        this.showToast(`同期エラー: ${err.message}`);
        this.store.logActivity('Gateway Error', `一覧取得失敗: ${err.message}`);
      }
    }
    this.render();
  }

  openConfigModal() {
    document.getElementById('cfg-api-url').value = this.backend.baseUrl;
    const statusMsg = document.getElementById('config-status-msg');
    statusMsg.style.display = 'none';
    this.configModal.classList.add('active');
  }

  closeConfigModal() {
    this.configModal.classList.remove('active');
  }

  async testGatewayHealth() {
    const statusMsg = document.getElementById('config-status-msg');
    const inputUrl = document.getElementById('cfg-api-url').value.trim();
    statusMsg.style.display = 'block';
    statusMsg.textContent = '疎通テスト実行中 (/api/health)...';
    statusMsg.className = 'status-msg-box';

    try {
      const res = await fetch(`${inputUrl}/api/health`);
      const data = await res.json();
      if (data.status === 'ok') {
        statusMsg.textContent = `✔ 疎通成功! Worker: ${data.worker} (Supabase Configured: ${data.supabaseConfigured})`;
        statusMsg.className = 'status-msg-box success';
      } else {
        throw new Error(data.error || 'Invalid response');
      }
    } catch (e) {
      statusMsg.textContent = `❌ 接続失敗: ${e.message}`;
      statusMsg.className = 'status-msg-box error';
    }
  }

  handleSaveConfig() {
    const inputUrl = document.getElementById('cfg-api-url').value.trim();
    if (inputUrl) {
      this.backend.setBaseUrl(inputUrl);
      this.showToast(`Backend Gateway: ${inputUrl}`);
      this.closeConfigModal();
      this.render();
    }
  }

  openAuthModal(mode = 'login') {
    this.switchAuthTab(mode);
    document.getElementById('auth-error-msg').style.display = 'none';
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-password').value = '';
    this.authModal.classList.add('active');
  }

  closeAuthModal() {
    this.authModal.classList.remove('active');
  }

  switchAuthTab(mode) {
    this.authMode = mode;
    const tabLogin = document.getElementById('tab-btn-login');
    const tabSignUp = document.getElementById('tab-btn-signup');
    const title = document.getElementById('auth-modal-title');
    const submitBtn = document.getElementById('btn-auth-submit');

    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabSignUp.classList.remove('active');
      title.textContent = 'NEXUS Cloud Login';
      submitBtn.textContent = 'Login';
    } else {
      tabSignUp.classList.add('active');
      tabLogin.classList.remove('active');
      title.textContent = 'Create NEXUS Account';
      submitBtn.textContent = 'Sign Up';
    }
  }

  async handleAuthSubmit() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorBox = document.getElementById('auth-error-msg');
    const submitBtn = document.getElementById('btn-auth-submit');

    errorBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Connecting via Cloudflare...';

    try {
      if (this.authMode === 'signup') {
        await this.backend.signUp(email, password);
        alert('確認メールを送信しました。認証後ログインしてください。');
        this.switchAuthTab('login');
      } else {
        await this.backend.login(email, password);
        this.showToast(`Logged in as ${email}`);
        this.store.logActivity('Auth', `ログイン成功: ${email}`);
        await this.syncProjects();
        this.closeAuthModal();
      }
    } catch (err) {
      errorBox.textContent = err.message || '認証エラーが発生しました';
      errorBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = this.authMode === 'login' ? 'Login' : 'Sign Up';
      this.render();
    }
  }

  async handleLogout() {
    try {
      await this.backend.logout();
      this.store.cloudProjects = [];
      this.showToast('Logged out');
      this.store.logActivity('Auth', 'ログアウトしました');
    } catch (err) {
      this.showToast(`Logout error: ${err.message}`);
    }
    this.render();
  }

  openCreateModal() {
    this.createModal.classList.add('active');
    document.getElementById('proj-name').focus();
  }

  closeCreateModal() {
    this.createModal.classList.remove('active');
  }

  async handleCreateProjectSubmit() {
    const name = document.getElementById('proj-name').value.trim();
    const studioType = document.querySelector('input[name="studio-type"]:checked').value;
    const desc = document.getElementById('proj-desc').value.trim();

    if (!name) {
      alert('プロジェクト名を入力してください');
      return;
    }

    const newProject = {
      id: 'proj_' + Date.now(),
      name,
      type: studioType,
      desc: desc || 'NEXUS Project',
      created: new Date().toLocaleDateString(),
      project_data: { type: studioType, files: [] }
    };

    if (this.backend.currentUser) {
      try {
        const cloudItem = await this.backend.createProject(newProject);
        this.store.cloudProjects.unshift(cloudItem);
        this.store.setActiveProject(cloudItem.id);
        this.store.logActivity('Cloudflare', `Worker経由でプロジェクト [${name}] を保存しました。`);
        this.showToast(`Cloud Project Created: ${name}`);
      } catch (err) {
        this.showToast(`Cloud保存失敗: ${err.message} (ローカルに保存します)`);
        this.store.addLocalProject(newProject);
      }
    } else {
      this.store.addLocalProject(newProject);
      this.showToast(`Local Project Created: ${name}`);
    }

    this.closeCreateModal();
    this.render();
  }

  async handleSaveCurrentProject() {
    const isCloud = Boolean(this.backend.currentUser);
    const active = this.store.getActiveProject(isCloud);
    if (!active) return;

    if (isCloud && active.isCloud) {
      try {
        await this.backend.saveProject(active);
        this.showToast(`Cloudflare経由で保存完了: ${active.name}`);
        this.store.logActivity('Cloudflare', `プロジェクト更新完了: ${active.name}`);
      } catch (err) {
        this.showToast(`Save error: ${err.message}`);
      }
    } else {
      this.store.saveState();
      this.showToast(`Local Project saved: ${active.name}`);
    }
  }

  async deleteProject(id) {
    if (!confirm('このプロジェクトを削除してもよろしいですか？')) return;

    if (this.backend.currentUser) {
      const target = this.store.cloudProjects.find(p => p.id === id);
      if (target && target.isCloud) {
        try {
          await this.backend.deleteProject(id);
          this.store.removeProject(id, true);
          this.showToast('プロジェクトを削除しました (Cloudflare)');
          this.render();
          return;
        } catch (err) {
          this.showToast(`削除失敗: ${err.message}`);
          return;
        }
      }
    }

    this.store.removeProject(id, false);
    this.showToast('プロジェクトを削除しました (Local)');
    this.render();
  }

  promptCreateTask() {
    const title = prompt('タスクの内容を入力してください:');
    if (!title) return;
    const active = this.store.getActiveProject(Boolean(this.backend.currentUser));
    this.store.addTask({
      id: 'task_' + Date.now(),
      projectId: active ? active.id : null,
      title,
      assignee: 'Qwen Developer',
      status: 'backlog'
    });
    this.render();
  }

  handleChatSubmit() {
    const input = document.getElementById('chat-input');
    const agentSelect = document.getElementById('chat-agent-select');
    const msg = input.value.trim();
    if (!msg) return;

    const chatContainer = document.getElementById('chat-messages');
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = msg;
    chatContainer.appendChild(userBubble);
    input.value = '';

    const agentName = agentSelect.value.split(' ')[0];
    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-bubble agent';
    typingBubble.textContent = `${agentName} is thinking via Worker Edge...`;
    chatContainer.appendChild(typingBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    setTimeout(() => {
      let reply = '';
      if (agentName === 'Llama') {
        reply = `[Llama Architect] 要求を分析しました。タスク「${msg.slice(0, 20)}...」を分解し、Task Boardに配置可能です。`;
      } else if (agentName === 'Qwen') {
        reply = `[Qwen Developer] 実装コード差分を生成しました。Human Approval Gateへ送出します。`;
        this.store.queueApproval({
          id: 'gate_' + Date.now(),
          title: `Direct Instruction: ${msg.slice(0, 25)}`,
          agent: 'Qwen Developer',
          targetFile: 'src/main.js',
          diffContent: `+ // Requested implementation: "${msg}"\n+ console.log("Nexus Worker Gateway Active");`
        });
        this.render();
      } else if (agentName === 'DeepSeek') {
        reply = `[DeepSeek Reviewer] 直近の差分を精査しました。構文エラーはありません。`;
      } else {
        reply = `[GLM Tester] ユニットテストを実行: 3 passed, 0 failed.`;
      }
      typingBubble.textContent = reply;
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 600);
  }

  triggerGateModal(approval) {
    this.currentApprovalItem = approval;
    document.getElementById('gate-action-title').textContent = approval.title;
    document.getElementById('gate-target-file').textContent = `Target: ${approval.targetFile}`;
    document.getElementById('gate-diff-content').textContent = approval.diffContent;
    document.getElementById('gate-agent-info').textContent = `Requested by: ${approval.agent}`;
    this.gateModal.classList.add('active');
  }

  handleGateDecision(approved) {
    if (!this.currentApprovalItem) return;
    this.store.resolveApproval(this.currentApprovalItem.id, approved);
    this.gateModal.classList.remove('active');
    this.showToast(approved ? 'Change approved & applied' : 'Change rejected');
    this.currentApprovalItem = null;
    this.render();
  }

  triggerAgent(agentName) {
    this.store.logActivity(agentName, `${agentName} が手動トリガーされました。待機中タスクを検索中...`);
    this.showToast(`${agentName} invoked.`);
    this.render();
  }

  switchView(viewName) {
    this.currentView = viewName;
    Object.keys(this.views).forEach(key => {
      this.views[key].classList.toggle('active', key === viewName);
    });
    this.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });
    this.render();
  }

  showToast(message) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 2800);
  }

  seedInitialDataIfEmpty() {
    if (this.store.state.projects.length === 0) {
      const sampleProj = {
        id: 'proj_sample_01',
        name: 'Cyberpunk Drone Race',
        type: 'GAME',
        desc: 'PlayCanvas Engineを用いた3D近未来ドローンレースのプロトタイプ',
        created: new Date().toLocaleDateString()
      };
      this.store.addLocalProject(sampleProj);

      this.store.addTask({
        id: 'task_01',
        projectId: sampleProj.id,
        title: '物理挙動スクリプトのプロトタイプ作成',
        assignee: 'Qwen Developer',
        status: 'in_progress'
      });
      this.store.addTask({
        id: 'task_02',
        projectId: sampleProj.id,
        title: '3Dコースアセットの選定・ライセンス確認',
        assignee: 'Llama Architect',
        status: 'backlog'
      });

      this.store.queueApproval({
        id: 'gate_sample_01',
        title: 'ドローン移動コントローラーの追加',
        agent: 'Qwen Developer',
        targetFile: 'scripts/droneController.js',
        diffContent: `+ // NEXUS Auto-generated Drone Controller\n+ const DronePhysics = pc.createScript('dronePhysics');\n+ DronePhysics.prototype.update = function(dt) {\n+   this.entity.translate(0, 0, -10 * dt);\n+ };`
      });
    }
  }

  render() {
    const isCloud = Boolean(this.backend.currentUser);
    const projects = this.store.getAllProjects(isCloud);
    const activeProject = this.store.getActiveProject(isCloud);

    const headerBadge = document.getElementById('header-active-project');
    if (activeProject) {
      headerBadge.textContent = `${activeProject.type === 'GAME' ? '🎮' : '💻'} ${activeProject.name}${activeProject.isCloud ? ' ☁' : ''}`;
      headerBadge.style.color = '#00f3ff';
    } else {
      headerBadge.textContent = 'プロジェクト未選択';
      headerBadge.style.color = '';
    }

    this.renderCloudStatus();

    document.getElementById('stat-proj-count').textContent = projects.length;
    document.getElementById('stat-pending-approvals').textContent = this.store.state.pendingApprovals.length;
    document.getElementById('stat-cloud-mode').textContent = isCloud ? 'Cloudflare Workers (Active)' : 'Cloudflare (Ready)';
    document.getElementById('stat-cloud-mode').style.color = isCloud ? 'var(--accent-green)' : 'var(--accent-cyan)';

    const projGrid = document.getElementById('projects-grid');
    const recentContainer = document.getElementById('dash-recent-projects');

    if (projects.length === 0) {
      const emptyHtml = `<div class="empty-state">プロジェクトがありません。「+ プロジェクト作成」から開始してください。</div>`;
      projGrid.innerHTML = emptyHtml;
      recentContainer.innerHTML = emptyHtml;
    } else {
      projGrid.innerHTML = projects.map(p => {
        const isActive = activeProject && activeProject.id === p.id;
        return `
          <div class="project-card ${isActive ? 'active-proj' : ''}">
            <div class="project-card-header">
              <div>
                <span class="badge ${p.type === 'GAME' ? 'badge-game' : 'badge-app'}">${p.type} STUDIO</span>
                ${p.isCloud ? '<span class="badge badge-cloud" style="margin-left:4px;">CLOUD</span>' : ''}
              </div>
              ${isActive ? '<span class="badge badge-running">Active</span>' : ''}
            </div>
            <div>
              <div class="project-card-title">${p.name}</div>
              <div class="project-card-desc">${p.desc}</div>
            </div>
            <div class="project-card-footer">
              <span style="font-size:10px; color:var(--text-subtle);">${p.created}</span>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-xs btn-danger-subtle" onclick="nexusApp.deleteProject('${p.id}')">削除</button>
                <button class="btn btn-xs ${isActive ? 'btn-secondary' : 'btn-primary'}" onclick="nexusApp.selectProject('${p.id}')">
                  ${isActive ? '開く' : '選択'}
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      recentContainer.innerHTML = projects.slice(0, 4).map(p => `
        <div class="compact-proj-item" onclick="nexusApp.selectProject('${p.id}')">
          <div>
            <strong>${p.name}</strong>
            <span class="badge ${p.type === 'GAME' ? 'badge-game' : 'badge-app'}">${p.type}</span>
            ${p.isCloud ? '<span class="badge badge-cloud">CLOUD</span>' : ''}
          </div>
          <span style="color:var(--text-subtle); font-size:11px;">${p.created}</span>
        </div>
      `).join('');
    }

    const logContainer = document.getElementById('dash-activity-log');
    logContainer.innerHTML = this.store.state.activityLogs.map(l => `
      <div class="log-entry">
        <span class="time">${l.time}</span>
        <span class="agent-tag">[${l.agent}]</span>
        <span>${l.message}</span>
      </div>
    `).join('');

    const wsTitle = document.getElementById('workspace-title');
    const wsSub = document.getElementById('workspace-subtitle');
    const wsBadge = document.getElementById('workspace-type-badge');
    const studioPlaceholder = document.getElementById('studio-placeholder');

    if (activeProject) {
      wsTitle.textContent = `${activeProject.name} — Workspace`;
      wsSub.textContent = activeProject.desc;
      wsBadge.textContent = `${activeProject.type} STUDIO READY`;
      wsBadge.className = `badge ${activeProject.type === 'GAME' ? 'badge-game' : 'badge-app'}`;
      this.btnSaveCurrentProj.style.display = 'inline-flex';

      if (activeProject.type === 'GAME') {
        studioPlaceholder.innerHTML = `
          <div style="text-align:center; padding: 40px;">
            <div style="font-size:36px; margin-bottom:12px;">🎮 PlayCanvas Viewport Mount Slot</div>
            <p style="color:var(--text-muted); max-width:480px; margin:0 auto 16px;">
              Phase 3でPlayCanvas WebGL Canvas、Hierarchy、Inspectorがここに統合されます。
            </p>
            <button class="btn btn-secondary" onclick="nexusApp.switchView('tasks')">関連タスクを確認</button>
          </div>
        `;
      } else {
        studioPlaceholder.innerHTML = `
          <div style="text-align:center; padding: 40px;">
            <div style="font-size:36px; margin-bottom:12px;">💻 Monaco Editor IDE Mount Slot</div>
            <p style="color:var(--text-muted); max-width:480px; margin:0 auto 16px;">
              Phase 2でMonaco Editor、Live HTML/CSS/JS Previewがここに統合されます。
            </p>
            <button class="btn btn-secondary" onclick="nexusApp.switchView('tasks')">関連タスクを確認</button>
          </div>
        `;
      }
    } else {
      wsTitle.textContent = 'Studio Workspace';
      wsSub.textContent = 'プロジェクトを選択してください';
      wsBadge.textContent = 'NO PROJECT';
      wsBadge.className = 'badge';
      this.btnSaveCurrentProj.style.display = 'none';
    }

    this.renderKanban();
  }

  renderCloudStatus() {
    const user = this.backend.currentUser;

    if (user) {
      this.authActionsContainer.innerHTML = `
        <button class="btn btn-secondary btn-sm" id="btn-logout" title="ログアウト">
          🚪 Logout (${user.email.split('@')[0]})
        </button>
      `;
      document.getElementById('btn-logout').addEventListener('click', () => this.handleLogout());

      this.userDisplayEmail.textContent = user.email;
      this.userSyncStatus.textContent = 'Worker Session Active';
      this.userSyncStatus.style.color = 'var(--accent-green)';
      this.cloudStatusDot.className = 'status-dot cloud-connected';
      this.cloudStatusText.textContent = 'Workers: nexus (Connected)';
    } else {
      this.authActionsContainer.innerHTML = `
        <button class="btn btn-primary btn-sm" id="btn-open-auth-modal">
          🔑 Login / Sign Up
        </button>
      `;
      document.getElementById('btn-open-auth-modal').addEventListener('click', () => this.openAuthModal('login'));

      this.userDisplayEmail.textContent = 'Guest (Local)';
      this.userSyncStatus.textContent = 'Gateway Ready (Logged Out)';
      this.userSyncStatus.style.color = 'var(--text-subtle)';
      this.cloudStatusDot.className = 'status-dot';
      this.cloudStatusText.textContent = 'Workers: nexus (Standby)';
    }
  }

  renderKanban() {
    const cols = {
      backlog: document.getElementById('col-backlog'),
      in_progress: document.getElementById('col-in_progress'),
      review: document.getElementById('col-review'),
      done: document.getElementById('col-done')
    };

    Object.values(cols).forEach(c => c.innerHTML = '');
    const counts = { backlog: 0, in_progress: 0, review: 0, done: 0 };

    this.store.state.tasks.forEach(task => {
      counts[task.status] = (counts[task.status] || 0) + 1;
      const card = document.createElement('div');
      card.className = 'task-card';
      card.innerHTML = `
        <div class="task-header">
          <span class="task-assignee">${task.assignee}</span>
        </div>
        <div class="task-title">${task.title}</div>
        <div class="task-actions">
          ${task.status !== 'done' ? `<button class="btn btn-xs btn-secondary" onclick="nexusApp.advanceTask('${task.id}')">→</button>` : ''}
        </div>
      `;
      if (cols[task.status]) {
        cols[task.status].appendChild(card);
      }
    });

    this.store.state.pendingApprovals.forEach(appr => {
      counts.review++;
      const gateCard = document.createElement('div');
      gateCard.className = 'task-card';
      gateCard.style.borderColor = 'rgba(255, 184, 0, 0.4)';
      gateCard.innerHTML = `
        <div class="task-header">
          <span class="gate-warning-badge">APPROVAL GATE</span>
        </div>
        <div class="task-title">${appr.title}</div>
        <div style="font-size:10px; color:var(--text-subtle); margin-bottom:8px;">${appr.targetFile}</div>
        <div class="task-actions">
          <button class="btn btn-xs btn-primary" onclick="nexusApp.openGateApproval('${appr.id}')">判定</button>
        </div>
      `;
      cols.review.prepend(gateCard);
    });

    document.getElementById('count-backlog').textContent = counts.backlog;
    document.getElementById('count-inprogress').textContent = counts.in_progress;
    document.getElementById('count-review').textContent = counts.review;
    document.getElementById('count-done').textContent = counts.done;
  }

  advanceTask(taskId) {
    const task = this.store.state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const flow = ['backlog', 'in_progress', 'review', 'done'];
    const nextIdx = flow.indexOf(task.status) + 1;
    if (nextIdx < flow.length) {
      this.store.updateTaskStatus(taskId, flow[nextIdx]);
      this.render();
    }
  }

  openGateApproval(approvalId) {
    const appr = this.store.state.pendingApprovals.find(a => a.id === approvalId);
    if (appr) {
      this.triggerGateModal(appr);
    }
  }

  selectProject(id) {
    this.store.setActiveProject(id);
    const p = this.store.getActiveProject(Boolean(this.backend.currentUser));
    this.showToast(`Active Project: ${p.name}`);
    this.switchView('workspace');
  }
}

let nexusApp;
window.addEventListener('DOMContentLoaded', () => {
  nexusApp = new NexusApp();
});
