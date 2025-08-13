// assets/js/app-edit.js - for recipe_edit.html
document.addEventListener('DOMContentLoaded', () => {
    if (typeof supabase === 'undefined') { 
        alert('エラー: Supabaseライブラリの読み込みに失敗しました。');
        return;
    }

    const sb = supabase.createClient("https://ctxyawinblwcbkovfsyj.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q");
    const params = new URLSearchParams(location.search);
    let id = params.get('id');

    // --- すべての要素をここで一度に取得 ---
    const form = document.getElementById('editForm');
    const titleEl = document.getElementById('title');
    const categoryEl = document.getElementById('category');
    const tagsEl = document.getElementById('tags');
    const notesEl = document.getElementById('notes');
    const statusEl = document.getElementById('status');
    const ingredientsEditor = document.getElementById('ingredientsEditor');
    const stepsEditor = document.getElementById('stepsEditor');
    const addIngBtn = document.getElementById('addIng');
    const addStepBtn = document.getElementById('addStep');
    const saveButtons = document.querySelectorAll('.js-save');
    const cancelButtons = document.querySelectorAll('.js-cancel');
    const viewButton = document.querySelector('.js-view');
    const deleteButton = document.querySelector('.js-delete');
    
    // --- AIモーダル要素 ---
    const aiWizardBtn = document.getElementById('ai-wizard-btn');
    const aiModal = document.getElementById('ai-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const aiStep1 = document.getElementById('ai-step-1');
    const aiStep2 = document.getElementById('ai-step-2');
    const aiLoading = document.getElementById('ai-loading');
    const genreBtns = document.querySelectorAll('.genre-btn');
    const getSuggestionsBtn = document.getElementById('get-suggestions-btn');
    const menuSuggestionsContainer = document.getElementById('menu-suggestions');
    const generateFullRecipeBtn = document.getElementById('generate-full-recipe-btn');
    const aiCustomRequestEl = document.getElementById('ai-custom-request');

    let selectedGenre = '';
    let selectedMenu = '';

    // --- ヘルパー関数 ---
    const escapeHtml = (s) => (s ?? "").toString().replace(/[&<>\"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
    const num = (s) => { const v = parseFloat(String(s || "").replace(/[, ]/g, '')); return isFinite(v) ? v : null; };

    // --- 動的な行の追加・削除 ---
    const addIngredientRow = (data = {}) => {
        if (!ingredientsEditor) return;
        const div = document.createElement('div');
        div.className = 'ingredient-row';
        div.innerHTML = `
          <input type="text" placeholder="材料名 *" value="${escapeHtml(data.item || '')}" data-field="item" class="ing-item">
          <div class="ing-qty-unit">
            <input type="number" placeholder="分量" value="${data.quantity !== null && data.quantity !== undefined ? escapeHtml(data.quantity) : ''}" data-field="quantity" class="ing-qty">
            <input type="text" placeholder="単位" value="${escapeHtml(data.unit || '')}" data-field="unit" class="ing-unit">
          </div>
          <button type="button" class="btn danger small js-remove-row">削除</button>
        `;
        ingredientsEditor.appendChild(div);
    };
    const addStepRow = (data = {}) => {
        if (!stepsEditor) return;
        const div = document.createElement('div');
        div.className = 'step-row';
        div.innerHTML = `
          <input type="text" placeholder="手順 *" value="${escapeHtml(data.instruction || '')}" data-field="instruction" style="grid-column: 1 / -2;">
          <button type="button" class="btn danger small js-remove-row" style="grid-column: -2 / -1;">削除</button>
        `;
        stepsEditor.appendChild(div);
    };

    // --- AIモーダル制御 ---
    const openModal = () => { if(aiModal) aiModal.style.display = 'flex'; };
    const closeModal = () => {
        if(aiModal) aiModal.style.display = 'none';
        resetModal();
    };
    const resetModal = () => {
        if(aiStep1) aiStep1.style.display = 'block';
        if(aiStep2) aiStep2.style.display = 'none';
        if(aiLoading) aiLoading.style.display = 'none';
        if(genreBtns) genreBtns.forEach(b => b.classList.remove('selected'));
        if(getSuggestionsBtn) getSuggestionsBtn.disabled = true;
        if(generateFullRecipeBtn) generateFullRecipeBtn.disabled = true;
        if(aiCustomRequestEl) aiCustomRequestEl.value = '';
        if(menuSuggestionsContainer) menuSuggestionsContainer.innerHTML = '';
        selectedGenre = '';
        selectedMenu = '';
    };

    // --- Gemini API 呼び出し ---
    const apiKey = "AIzaSyBNgqPMcJiVSysDAaXKzCOv08IGUeuEAwg";

    async function callGemini(prompt, responseSchema) {
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema }
        };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`API Error: ${response.status} ${response.statusText}`);
        const result = await response.json();
        console.log("Gemini API Response:", result);
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
            const reason = result.candidates?.[0]?.finishReason;
            throw new Error(reason === 'SAFETY' ? 'AIが安全でないと判断したため、応答を生成できませんでした。' : 'AIからの応答が空でした。');
        }
        return JSON.parse(jsonText);
    }

    // --- 読み込み・保存・削除 ---
    const loadRecipe = async () => {
        if (!id) {
            if(document.querySelector('.brand')) document.querySelector('.brand').textContent = '新規レシピ作成';
            addIngredientRow();
            addStepRow();
            return;
        }
        if(document.querySelector('.brand')) document.querySelector('.brand').textContent = 'レシピ編集';
        if(viewButton) viewButton.style.display = 'inline-block';
        if(deleteButton) deleteButton.style.display = 'inline-block';

        const { data: r, error } = await sb.from('recipes').select('*').eq('id', id).single();
        if (error) { alert('レシピの読み込みに失敗'); return; }
        
        if(titleEl) titleEl.value = r.title || '';
        if(categoryEl && r.category) categoryEl.value = r.category;
        if(tagsEl) tagsEl.value = (r.tags || []).join(', ');
        if(notesEl) notesEl.value = r.notes || '';
        
        const { data: ings } = await sb.from('recipe_ingredients').select('*').eq('recipe_id', id).order('position');
        if (ings) {
            if(ingredientsEditor) ingredientsEditor.innerHTML = '';
            ings.forEach(addIngredientRow);
        }
        const { data: steps } = await sb.from('recipe_steps').select('*').eq('recipe_id', id).order('position');
        if (steps) {
            if(stepsEditor) stepsEditor.innerHTML = '';
            steps.forEach(addStepRow);
        }
    };

    const saveRecipe = async () => {
        try {
            if (!titleEl || !categoryEl || !tagsEl || !notesEl) {
                throw new Error("フォームの入力項目が見つかりません。HTMLの構造を確認してください。");
            }

            const payload = {
                title: titleEl.value.trim(),
                category: categoryEl.value || null,
                tags: tagsEl.value.split(',').map(s => s.trim()).filter(Boolean),
                notes: notesEl.value.trim() || null,
            };
            if (!payload.title) { alert('料理名は必須です'); return; }
            if(statusEl) statusEl.textContent = '保存中...';
            let recipe_id = id;
            if (id) {
                const { error } = await sb.from('recipes').update(payload).eq('id', id);
                if (error) throw error; 
            } else {
                const { data, error } = await sb.from('recipes').insert(payload).select('id').single();
                if (error) throw error;
                id = data.id;
                recipe_id = id;
            }
            if(ingredientsEditor) await sb.from('recipe_ingredients').delete().eq('recipe_id', recipe_id);
            if(stepsEditor) await sb.from('recipe_steps').delete().eq('recipe_id', recipe_id);
            if(ingredientsEditor) {
                const ingData = [...ingredientsEditor.querySelectorAll('.ingredient-row')].map((row, i) => ({
                    recipe_id, position: i + 1,
                    item: row.querySelector('[data-field="item"]').value.trim(),
                    quantity: num(row.querySelector('[data-field="quantity"]').value),
                    unit: row.querySelector('[data-field="unit"]').value.trim() || null,
                })).filter(d => d.item);
                if (ingData.length > 0) {
                    const { error } = await sb.from('recipe_ingredients').insert(ingData);
                    if(error) throw error;
                }
            }
            if(stepsEditor) {
                const stepData = [...stepsEditor.querySelectorAll('.step-row')].map((row, i) => ({
                    recipe_id, position: i + 1,
                    instruction: row.querySelector('[data-field="instruction"]').value.trim(),
                })).filter(d => d.instruction);
                if (stepData.length > 0) {
                    const { error } = await sb.from('recipe_steps').insert(stepData);
                    if(error) throw error;
                }
            }
            if(statusEl) statusEl.textContent = '保存しました！';
            setTimeout(() => { location.href = `recipe_view.html?id=${recipe_id}`; }, 800);
        } catch (error) {
            console.error('Save failed:', error);
            if(statusEl) statusEl.textContent = `保存に失敗しました。`;
            alert(`保存に失敗しました:\n${error.message}`);
        }
    };
    
    const deleteRecipe = async () => {
        if (!id || !confirm('このレシピを完全に削除しますか？')) return;
        if(statusEl) statusEl.textContent = '削除中...';
        const { error } = await sb.from('recipes').delete().eq('id', id);
        if (error) {
            if(statusEl) statusEl.textContent = '削除に失敗しました。';
            alert('削除に失敗しました: ' + error.message);
        } else {
            alert('レシピを削除しました。');
            location.href = 'index.html';
        }
    };

    // --- イベントリスナーの集中管理 ---
    if(addIngBtn) addIngBtn.addEventListener('click', () => addIngredientRow());
    if(addStepBtn) addStepBtn.addEventListener('click', () => addStepRow());
    if(form) {
        form.addEventListener('click', (e) => {
            if (e.target.classList.contains('js-remove-row')) {
                e.target.closest('.ingredient-row, .step-row')?.remove();
            }
        });
    }

    if(saveButtons) saveButtons.forEach(btn => btn.addEventListener('click', saveRecipe));
    if(cancelButtons) cancelButtons.forEach(btn => btn.addEventListener('click', () => location.href = id ? `recipe_view.html?id=${id}` : 'index.html'));
    if(viewButton) viewButton.addEventListener('click', () => { if (id) location.href = `recipe_view.html?id=${id}`; });
    if(deleteButton) deleteButton.addEventListener('click', deleteRecipe);

    if(aiWizardBtn) aiWizardBtn.addEventListener('click', openModal);
    if(modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if(aiModal) aiModal.addEventListener('click', (e) => { if (e.target === aiModal) closeModal(); });

    if(genreBtns) {
        genreBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                genreBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedGenre = btn.dataset.genre;
                if(getSuggestionsBtn) getSuggestionsBtn.disabled = false;
            });
        });
    }
    
    // ★★★ メニュー選択ロジックをClickイベントに変更 ★★★
    if(menuSuggestionsContainer) {
        menuSuggestionsContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.menu-suggestions-item');
            if (item) {
                menuSuggestionsContainer.querySelectorAll('.menu-suggestions-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedMenu = item.dataset.menu;
                if(generateFullRecipeBtn) generateFullRecipeBtn.disabled = false;
            }
        });
    }
    
    if(getSuggestionsBtn) {
        getSuggestionsBtn.addEventListener('click', async () => {
            const ingredients = [...ingredientsEditor.querySelectorAll('[data-field="item"]')].map(input => input.value.trim()).filter(Boolean);
            if (ingredients.length === 0) { return alert('先に材料を1つ以上入力してください。'); }
            if(aiStep1) aiStep1.style.display = 'none';
            if(aiLoading) aiLoading.style.display = 'block';
            
            const customRequest = aiCustomRequestEl.value.trim();
            // ★★★ プロンプトを説明的なメニュー名になるように変更 ★★★
            let prompt = `あなたはプロの${selectedGenre}シェフです。以下の材料を活かした、料理の内容が想像できるような、創造的で食欲をそそる**日本語のメニュー名**を5つ提案してください。単なる材料の羅列ではなく、調理法や料理の特徴が伝わるような名前が望ましいです。`;
            if (customRequest) {
                prompt += `\n\n# 追加の希望\n${customRequest}`;
            }
            prompt += `\n\n回答はメニュー名のみの配列として、JSON形式で返してください。\n\n# 材料\n- ${ingredients.join('\n- ')}`;

            try {
                const response = await callGemini(prompt, { type: "ARRAY", items: { type: "STRING" } });
                // ★★★ 表示をシンプルなリストに変更 ★★★
                if(menuSuggestionsContainer) {
                    menuSuggestionsContainer.innerHTML = response.map((menu) => `<div class="menu-suggestions-item" data-menu="${escapeHtml(menu)}">${escapeHtml(menu)}</div>`).join('');
                }
                if(aiLoading) aiLoading.style.display = 'none';
                if(aiStep2) aiStep2.style.display = 'block';
            } catch (error) {
                alert(`メニュー案の生成に失敗しました。\n${error.message}`);
                resetModal();
            }
        });
    }

    if(generateFullRecipeBtn) {
        generateFullRecipeBtn.addEventListener('click', async () => {
            const ingredients = [...ingredientsEditor.querySelectorAll('[data-field="item"]')].map(input => input.value.trim()).filter(Boolean);
            if(aiStep2) aiStep2.style.display = 'none';
            if(aiLoading) aiLoading.style.display = 'block';

            const customRequest = aiCustomRequestEl.value.trim();
            let prompt = `あなたはプロの${selectedGenre}シェフです。「${selectedMenu}」という料理の完全なレシピを考案してください。ベースとなる材料は以下ですが、料理を完成させるために必要な追加材料や具体的な分量も提案してください。`;
            if (customRequest) {
                prompt += `\n\n# 追加の希望\n${customRequest}`;
            }
            prompt += `\n\n# ベース材料\n- ${ingredients.join('\n- ')}\n\n# 出力形式\n回答の**全ての項目は、必ず日本語で生成してください。** 回送は必ず以下のキーを含む日本語のJSON形式で返してください。\n- "title": 料理名\n- "category": 「アミューズ」「前菜」「温菜」「メイン」「デザート」のいずれか\n- "tags": タグの配列\n- "notes": 調理のコツやポイント\n- "ingredients": 材料の配列 ({"item": "材料名", "quantity": 数値, "unit": "単位"}) の形式\n- "steps": 調理手順の配列`;
            
            const schema = { type: "OBJECT", properties: { "title": { "type": "STRING" }, "category": { "type": "STRING" }, "tags": { "type": "ARRAY", items: { "type": "STRING" } }, "notes": { "type": "STRING" }, "ingredients": { "type": "ARRAY", items: { "type": "OBJECT", properties: { "item": { "type": "STRING" }, "quantity": { "type": "NUMBER" }, "unit": { "type": "STRING" } }, required: ["item", "quantity", "unit"] } }, "steps": { "type": "ARRAY", items: { "type": "STRING" } } }, required: ["title", "category", "tags", "notes", "ingredients", "steps"] };
            try {
                const recipeData = await callGemini(prompt, schema);
                if(titleEl) titleEl.value = recipeData.title || '';
                if(categoryEl) categoryEl.value = recipeData.category || categoryEl.value;
                if(tagsEl) tagsEl.value = (recipeData.tags || []).join(', ');
                if(notesEl) notesEl.value = recipeData.notes || '';
                if(ingredientsEditor) ingredientsEditor.innerHTML = '';
                if (recipeData.ingredients?.length) { recipeData.ingredients.forEach(ing => addIngredientRow(ing)); }
                if(stepsEditor) stepsEditor.innerHTML = '';
                if (recipeData.steps?.length) { recipeData.steps.forEach(step => addStepRow({ instruction: step })); }
                closeModal();
            } catch (error) {
                alert(`ルセットの生成に失敗しました。\n${error.message}`);
                resetModal();
            }
        });
    }

    // --- 初期読み込み ---
    loadRecipe();
});