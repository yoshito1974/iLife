// app-view.js - for recipe_view.html
document.addEventListener('DOMContentLoaded', () => {
  const sb = supabase.createClient("https://ctxyawinblwcbkovfsyj.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q");

  const params = new URLSearchParams(location.search);
  const id = params.get('id');

  if (!id) {
    alert('レシピIDが指定されていません。');
    location.href = 'index.html';
    return;
  }

  // --- 要素 ---
  const titleEl = document.getElementById('recipeTitle');
  const metaEl = document.getElementById('meta');
  const tagsEl = document.getElementById('tags');
  const favBtn = document.getElementById('favBtn');
  const introEl = document.getElementById('recipeIntro');
  const notesEl = document.getElementById('notes');
  const ingEl = document.getElementById('ingredients');
  const stepsEl = document.getElementById('steps');
  const editButtons = document.querySelectorAll('.js-edit');
  const backButtons = document.querySelectorAll('.js-back');

  // --- ヘルパー関数 ---
  const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>\"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
  const getClientId = () => localStorage.getItem("client_id");

  // --- お気に入りロジック ---
  let isFavorite = false;
  const updateFavButton = () => {
    favBtn.innerHTML = isFavorite ? '♥ お気に入り' : '♡ お気に入り';
    favBtn.classList.toggle('danger', isFavorite);
    favBtn.classList.toggle('ghost', !isFavorite);
  };

  const checkFavorite = async () => {
    const { data, error } = await sb.from("favorites").select("id").eq("recipe_id", id).eq("client_id", getClientId()).limit(1);
    if (error) { console.error("Fav check error:", error); return; }
    isFavorite = data && data.length > 0;
    updateFavButton();
  };

  const toggleFavorite = async () => {
    const originalState = isFavorite;
    isFavorite = !isFavorite;
    updateFavButton();
    
    try {
      if (isFavorite) {
        const { error } = await sb.from("favorites").insert({ recipe_id: id, client_id: getClientId() });
        if (error) throw error;
      } else {
        const { error } = await sb.from("favorites").delete().eq("recipe_id", id).eq("client_id", getClientId());
        if (error) throw error;
      }
    } catch (err) {
      console.error("Fav toggle error:", err);
      alert("お気に入り状態の更新に失敗しました。");
      isFavorite = originalState; // 状態を元に戻す
      updateFavButton();
    }
  };

  // --- 読み込みと描画 ---
  const loadRecipe = async () => {
    const { data: r, error } = await sb.from('recipes').select('*').eq('id', id).single();
    if (error || !r) {
      alert('レシピの読み込みに失敗しました。');
      location.href = 'index.html';
      return;
    }

    titleEl.textContent = r.title || '無題のレシピ';
    metaEl.textContent = r.updated_at ? `更新: ${new Date(r.updated_at).toLocaleString('ja-JP')}` : '';
    tagsEl.innerHTML = (r.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    introEl.textContent = r.intro || '';
    notesEl.textContent = r.notes || r.meta?.note || '';

    // 材料
    const { data: ings } = await sb.from('recipe_ingredients').select('*').eq('recipe_id', id).order('position');
    if (ings && ings.length > 0) {
      ingEl.innerHTML = `<table class="table">
        <thead><tr><th>材料名</th><th class="num">分量</th><th>単位</th></tr></thead>
        <tbody>${ings.map(i => `<tr><td>${escapeHtml(i.item)}</td><td class="num">${escapeHtml(i.quantity)}</td><td>${escapeHtml(i.unit)}</td></tr>`).join('')}</tbody>
      </table>`;
    } else {
      ingEl.innerHTML = '<div class="muted">材料は登録されていません。</div>';
    }

    // 手順
    const { data: steps } = await sb.from('recipe_steps').select('*').eq('recipe_id', id).order('position');
    if (steps && steps.length > 0) {
      stepsEl.innerHTML = steps.map(s => `<li>${escapeHtml(s.instruction)}</li>`).join('');
    } else {
      stepsEl.innerHTML = '<li class="muted">手順は登録されていません。</li>';
    }

    checkFavorite();
  };

  // --- イベントリスナー ---
  editButtons.forEach(btn => btn.addEventListener('click', () => location.href = `recipe_edit.html?id=${encodeURIComponent(id)}`));
  backButtons.forEach(btn => btn.addEventListener('click', () => history.length > 1 ? history.back() : (location.href = 'index.html')));
  favBtn.addEventListener('click', toggleFavorite);

  // --- 初期読み込み ---
  loadRecipe();
});
// JavaScript Document