/**
 * NEXUS CORE — Application Logic & State Store
 * Phase 1 + Supabase Cloud Integration + Render Build Support
 */

const STORAGE_KEY = 'nexus_core_state_v1';
const SUPABASE_CONFIG_KEY = 'nexus_supabase_config_v1';

// ==========================================
// 1. SUPABASE SERVICE LAYER
// ==========================================
class NexusSupabase {
  constructor(store) {
    this.store = store;
    this.client = null;
    this.currentUser = null;
    this.config = this.loadConfig();
    this.initClient();
  }

  loadConfig() {
    // 【要件5】Render Static Site ビルド時に生成された config.js を最優先
    if (typeof window !== 'undefined' && window.__NEXUS_CONFIG__ && window.__NEXUS_CONFIG__.SUPABASE_URL && window.__NEXUS_CONFIG__.SUPABASE_PUBLISHABLE_KEY) {
      return {
        url: window.__NEXUS_CONFIG__.SUPABASE_URL.trim(),
        key: window.__NEXUS_CONFIG__.SUPABASE_PUBLISHABLE_KEY.trim(),
        isEnvManaged: true
      };
    }

    // フォールバック: localStorage
    try {
      const data = localStorage.getItem(SUPABASE_CONFIG_KEY);
      return data ? { ...JSON.parse(data), isEnvManaged: false } : { url: '', key: '', isEnvManaged: false };
    } catch (e) {
      return { url: '', key: '', isEnvManaged: false };
    }
  }

  saveConfig(url, key) {
    this.config = { url: url.trim(), key: key.trim(), isEnvManaged: false };
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(this.config));
    return this.initClient();
  }

  clearConfig() {
    this.config = { url: '', key: '', isEnvManaged: false };
    localStorage.removeItem(SUPABASE_CONFIG_KEY);
    this.client = null;
    this.currentUser = null;
  }

  initClient() {
    if (!this.config.url || !this.config.key) {
      this.client = null;
      return false;
    }

    // Secret Keyの誤入力をブラウザ側で遮断
    if (this.config.key.startsWith('sb_secret_') || this.config.key.includes('service_role')) {
      throw new Error('Secret key (sb_secret_...) cannot be used in browser client. Please use Publishable or Anon key.');
    }

    try {
      if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        this.client = window.supabase.createClient(this.config.url, this.config.key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to init Supabase client:', err);
      this.client = null;
      return false;
    }
  }

  isConfigured() {
    return Boolean(this.client);
  }

  isAuthenticated() {
    return Boolean(this.currentUser);
  }

  async signUp(email, password) {
    if (!this.client) throw new Error('Supabase is not configured.');
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async signIn(email, password) {
    if (!this.client) throw new Error('Supabase is not configured.');
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.currentUser = data.user;
    return data;
  }

  async signOut() {
    if (!this.client) return;
    const { error } = await this.client.auth.signOut();
    this.currentUser = null;
    if (error) throw error;
  }

  async checkSession() {
    if (!this.client) return null;
    try {
      const { data: { session }, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.currentUser = session ? session.user : null;
      return this.currentUser;
    } catch (e) {
      console.warn('Session check warning:', e.message);
      this.currentUser = null;
      return null;
    }
  }

  async fetchCloudProjects() {
    if (!this.client || !this.currentUser) return null;
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return data.map(item => ({
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

  async createCloudProject(project) {
    if (!this.client || !this.currentUser) return null;

    const payload = {
      name: project.name,
      description: project.desc,
      user_id: this.currentUser.id,
      project_data: {
        type: project.type,
        internalId: project.id,
        files: project.project_data?.files || []
      }
    };

    const { data, error } = await this.client
      .from('projects')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      type: data.project_data?.type || 'GAME',
      desc: data.description || '',
      created: new Date(data.created_at).toLocaleDateString(),
      updated_at: data.updated_at,
      project_data: data.project_data,
      isCloud: true
    };
  }

  async saveCloudProject(project) {
    if (!this.client || !this.currentUser) return null;

    const payload = {
      name: project.name,
      description: project.desc,
      project_data: {
        type: project.type,
        files: project.project_data?.files || [],
        savedAt: new Date().toISOString()
      }
    };

    const { data, error } = await this.client
      .from('projects')
      .update(payload)
      .eq('id', project.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteCloudProject(projectId) {
    if (!this.client || !this.currentUser) return null;
    const { error } = await this.client
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) throw error;
    return true;
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
      console.warn('Failed to read from localStorage', e);
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
    this.supabase = new NexusSupabase(this.store);
    this.currentView = 'dashboard';
    this.authMode = 'login';

    this.initElements();
    this.bindEvents();
    this.seedInitialDataIfEmpty();
    this.initSupabaseAuthListener();
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
    this.metricCloudSync = document.getElementById('metric-cloud-sync');
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
    document.getElementById('btn-refresh-projects').addEventListener('click', () => this.syncProjectsFromSource());
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
    document.getElementById('btn-clear-config').addEventListener('click', () => this.handleClearConfig());

    document.getElementById('btn-open-auth-modal').addEventListener('click', () => this.openAuthModal('login'));
    document.getElementById('btn-close-auth-modal').addEventListener('click', () => this.closeAuthModal());
    document.getElementById('tab-btn-login').addEventListener('click', () => this.switchAuthTab('login'));
    document.getElementById('tab-btn-signup').addEventListener('click', () => this.switchAuthTab('signup'));
    document.getElementById('auth-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAuthSubmit();
    });
  }

  async initSupabaseAuthListener() {
    if (!this.supabase.isConfigured()) {
      this.renderCloudStatus();
      return;
    }

    try {
      const user = await this.supabase.checkSession();
      if (user) {
        this.store.logActivity('Supabase', `セッションを復元しました: ${user.email}`);
        await this.syncProjectsFromSource();
      }

      if (this.supabase.client) {
        this.supabase.client.auth.onAuthStateChange(async (event, session) => {
          this.supabase.currentUser = session ? session.user : null;
          if (event === 'SIGNED_IN') {
            this.showToast(`Logged in as ${session.user.email}`);
            this.store.logActivity('Auth', `ログインに成功しました: ${session.user.email}`);
            await this.syncProjectsFromSource();
          } else if (event === 'SIGNED_OUT') {
            this.showToast('Logged out');
            this.store.logActivity('Auth', 'ログアウトしました');
            this.store.cloudProjects = [];
          }
          this.render();
        });
      }
    } catch (err) {
      console.warn('Supabase auth init notice:', err.message);
    }

    this.render();
  }

  async syncProjectsFromSource() {
    if (this.supabase.isAuthenticated()) {
      try {
        const cloudList = await this.supabase.fetchCloudProjects();
        if (cloudList) {
          this.store.cloudProjects = cloudList;
          this.showToast('クラウドプロジェクトを同期しました');
        }
      } catch (err) {
        this.showToast(`同期エラー: ${err.message}`);
        this.store.logActivity('Supabase Error', `一覧取得失敗: ${err.message}`);
      }
    }
    this.render();
  }

  openConfigModal() {
    document.getElementById('cfg-supabase-url').value = this.supabase.config.url || '';
    document.getElementById('cfg-supabase-key').value = this.supabase.config.key || '';
    const statusMsg = document.getElementById('config-status-msg');
    const hintText = document.getElementById('cfg-hint-text');

    if (this.supabase.config.isEnvManaged) {
      hintText.innerHTML = `<span style="color:var(--accent-green); font-weight:600;">⚡ Render Environment Managed:</span><br>接続情報はビルド環境変数から自動適用されています。手動変更はローカルにのみ保存されます。`;
    } else {
      hintText.innerHTML = `Supabaseプロジェクトの接続情報を入力してください。<br>※ 公開鍵のみ保存されます。Secret Keyは絶対に入力しないでください。`;
    }

    statusMsg.style.display = 'none';
    this.configModal.classList.add('active');
  }

  closeConfigModal() {
    this.configModal.classList.remove('active');
  }

  async handleSaveConfig() {
    const url = document.getElementById('cfg-supabase-url').value;
    const key = document.getElementById('cfg-supabase-key').value;
    const statusMsg = document.getElementById('config-status-msg');

    try {
      this.supabase.saveConfig(url, key);
      statusMsg.textContent = 'Supabaseクライアントを初期化しました。';
      statusMsg.className = 'status-msg-box success';
      statusMsg.style.display = 'block';

      await this.initSupabaseAuthListener();
      this.showToast('Supabase settings saved.');
      setTimeout(() => this.closeConfigModal(), 800);
    } catch (err) {
      statusMsg.textContent = err.message;
      statusMsg.className = 'status-msg-box error';
      statusMsg.style.display = 'block';
    }
  }

  handleClearConfig() {
    if (confirm('Supabase接続設定を削除し、ローカルモードに戻しますか？')) {
      this.supabase.clearConfig();
      this.store.cloudProjects = [];
      this.showToast('Supabase config cleared.');
      this.closeConfigModal();
      this.render();
    }
  }

  openAuthModal(mode = 'login') {
    if (!this.supabase.isConfigured()) {
      this.showToast('Supabase接続情報が未設定です');
      this.openConfigModal();
      return;
    }
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
    submitBtn.textContent = 'Connecting...';

    try {
      if (this.authMode === 'signup') {
        const res = await this.supabase.signUp(email, password);
        if (res.user && !res.session) {
          alert('確認メールを送信しました。メール内のリンクをクリックして認証を完了してください。');
        }
        this.showToast('Account created!');
      } else {
        await this.supabase.signIn(email, password);
      }
      this.closeAuthModal();
    } catch (err) {
      errorBox.textContent = err.message || '認証エラーが発生しました';
      errorBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = this.authMode === 'login' ? 'Login' : 'Sign Up';
    }
  }

  async handleLogout() {
    try {
      await this.supabase.signOut();
    } catch (err) {
      this.showToast(`Logout error: ${err.message}`);
    }
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

    if (this.supabase.isAuthenticated()) {
      try {
        const cloudItem = await this.supabase.createCloudProject(newProject);
        this.store.cloudProjects.unshift(cloudItem);
        this.store.setActiveProject(cloudItem.id);
        this.store.logActivity('Supabase', `クラウドプロジェクト [${name}] をDBに登録しました。`);
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
    const active = this.store.getActiveProject(this.supabase.isAuthenticated());
    if (!active) return;

    if (this.supabase.isAuthenticated() && active.isCloud) {
      try {
        await this.supabase.saveCloudProject(active);
        this.showToast(`Project saved to Supabase: ${active.name}`);
        this.store.logActivity('Supabase', `クラウド保存完了: ${active.name}`);
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

    if (this.supabase.isAuthenticated()) {
      const target = this.store.cloudProjects.find(p => p.id === id);
      if (target && target.isCloud) {
        try {
          await this.supabase.deleteCloudProject(id);
          this.store.removeProject(id, true);
          this.showToast('Supabaseからプロジェクトを削除しました');
          this.render();
          return;
        } catch (err) {
          this.showToast(`削除失敗: ${err.message}`);
          return;
        }
      }
    }

    this.store.removeProject(id, false);
    this.showToast('プロジェクトを削除しました');
    this.render();
  }

  promptCreateTask() {
    const title = prompt('タスクの内容を入力してください:');
    if (!title) return;
    const active = this.store.getActiveProject(this.supabase.isAuthenticated());
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
    typingBubble.textContent = `${agentName} is thinking...`;
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
          diffContent: `+ // Requested implementation: "${msg}"\n+ console.log("Nexus Worker dispatched via Cloudflare Edge");`
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
    const isCloud = this.supabase.isAuthenticated();
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
    document.getElementById('stat-cloud-mode').textContent = isCloud ? 'Supabase Sync' : (this.supabase.isConfigured() ? 'Supabase Ready' : 'LocalStorage');
    document.getElementById('stat-cloud-mode').style.color = isCloud ? 'var(--accent-green)' : (this.supabase.isConfigured() ? 'var(--accent-cyan)' : 'var(--text-subtle)');

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
    const isConfigured = this.supabase.isConfigured();
    const user = this.supabase.currentUser;

    if (user) {
      this.authActionsContainer.innerHTML = `
        <button class="btn btn-secondary btn-sm" id="btn-logout" title="ログアウト">
          🚪 Logout (${user.email.split('@')[0]})
        </button>
      `;
      document.getElementById('btn-logout').addEventListener('click', () => this.handleLogout());

      this.userDisplayEmail.textContent = user.email;
      this.userSyncStatus.textContent = 'Supabase Connected';
      this.userSyncStatus.style.color = 'var(--accent-green)';
      this.cloudStatusDot.className = 'status-dot cloud-connected';
      this.cloudStatusText.textContent = 'Supabase Cloud Sync';
      this.metricCloudSync.textContent = 'Active (RLS)';
      this.metricCloudSync.style.color = 'var(--accent-green)';
    } else {
      this.authActionsContainer.innerHTML = `
        <button class="btn btn-primary btn-sm" id="btn-open-auth-modal">
          🔑 Login / Sign Up
        </button>
      `;
      document.getElementById('btn-open-auth-modal').addEventListener('click', () => this.openAuthModal('login'));

      this.userDisplayEmail.textContent = 'Guest (Local)';
      this.userSyncStatus.textContent = isConfigured ? 'Supabase Ready (Logged Out)' : 'Offline Storage';
      this.userSyncStatus.style.color = 'var(--text-subtle)';
      this.cloudStatusDot.className = isConfigured ? 'status-dot cloud-offline' : 'status-dot';
      this.cloudStatusText.textContent = isConfigured ? 'Auth Required' : 'Cloud Ready';
      this.metricCloudSync.textContent = isConfigured ? 'Configured' : 'Disabled';
      this.metricCloudSync.style.color = isConfigured ? 'var(--accent-cyan)' : 'var(--text-subtle)';
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
    const p = this.store.getActiveProject(this.supabase.isAuthenticated());
    this.showToast(`Active Project: ${p.name}`);
    this.switchView('workspace');
  }
}

let nexusApp;
window.addEventListener('DOMContentLoaded', () => {
  nexusApp = new NexusApp();
});