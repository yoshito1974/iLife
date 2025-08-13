// assets/js/app-index.js - for index.html
document.addEventListener('DOMContentLoaded', () => {
  // Supabaseライブラリが読み込まれているかを確認
  if (typeof supabase === 'undefined') {
      alert('エラー: Supabaseライブラリの読み込みに失敗しました。');
      return;
  }

  const sb = supabase.createClient("https://ctxyawinblwcbkovfsyj.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q");

  const cardListEl = document.getElementById('cardList');
  const tabs = document.querySelectorAll('.tab');
  const newButtons = document.querySelectorAll('.js-new');

  if (!cardListEl) {
    console.error("Element with id 'cardList' not found.");
    return;
  }

  let allRecipes = [];
  let favoriteRecipes = [];
  let currentView = 'all';

  // --- ヘルパー関数 ---
  const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>\"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
  
  const getClientId = () => {
    let clientId = localStorage.getItem("client_id");
    if (!clientId) {
      clientId = crypto?.randomUUID?.() || String(Math.random()).slice(2);
      localStorage.setItem("client_id", clientId);
    }
    return clientId;
  };

  // --- データ取得 ---
  const fetchAllRecipes = async () => {
    // ★★★ 修正点: `updated_at` を `created_at` に変更 ★★★
    const { data, error } = await sb.from("recipes")
      .select("id,title,tags,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error('Failed to fetch recipes:', error);
      alert(`レシピの読み込みに失敗しました。\nエラー: ${error.message}`);
      cardListEl.innerHTML = '<div class="empty">レシピの読み込みに失敗しました。</div>';
      return [];
    }
    return data;
  };

  const fetchFavoriteRecipes = async () => {
    const { data, error } = await sb.from("favorites")
      .select("recipes!inner(id,title,tags,created_at)")
      .eq("client_id", getClientId())
      .order("created_at", { ascending: false });

    if (error) {
      console.error('Failed to fetch favorites:', error);
      // お気に入りリストの読み込み失敗は、メインリストに影響しないようにする
      return [];
    }
    return (data || []).map(x => x.recipes);
  };

  // --- 描画 ---
  const renderCards = (recipes) => {
    cardListEl.innerHTML = '';
    if (!recipes || recipes.length === 0) {
      cardListEl.innerHTML = '<div class="empty">レシピがありません。</div>';
      return;
    }
    recipes.forEach(r => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = r.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML = `
        <h3>${escapeHtml(r.title)}</h3>
        <div>${(r.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(" ")}</div>
        <div class="muted" style="font-size: 0.8em; margin-top: 8px;">${r.created_at ? `作成日: ${new Date(r.created_at).toLocaleDateString()}` : ''}</div>
      `;
      cardListEl.appendChild(card);
    });
  };

  const updateView = () => {
    renderCards(currentView === 'all' ? allRecipes : favoriteRecipes);
  };

  // --- イベントリスナー ---
  if(tabs) {
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        currentView = tab.dataset.tab;
        updateView();
      });
    });
  }

  if(newButtons) {
    newButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        location.href = 'recipe_edit.html';
      });
    });
  }

  cardListEl.addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-id]');
    if (card) {
      const id = card.dataset.id;
      location.href = `recipe_view.html?id=${encodeURIComponent(id)}`;
    }
  });

  // --- 初期読み込み ---
  const init = async () => {
    cardListEl.innerHTML = '<div class="empty">読み込み中...</div>';
    // Promise.allSettledを使い、片方の失敗がもう片方に影響しないようにする
    const results = await Promise.allSettled([
      fetchAllRecipes(),
      fetchFavoriteRecipes()
    ]);
    
    allRecipes = results[0].status === 'fulfilled' ? results[0].value : [];
    favoriteRecipes = results[1].status === 'fulfilled' ? results[1].value : [];

    updateView();
  };

  init();
});
