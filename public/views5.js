/* Vues : crédits vendeur (recharge, options payantes) et onglet Crédits de l'administration. */
(function () {
  'use strict';
  const T = window.T, { esc, dh, $ } = T, DJ = T.DJ;
  const fld = (id, label, inner, hint) => `<div class="field"><label for="${id}">${label}</label>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const dShort = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const TOP_LBL = { pending: ['En attente de validation', 'warn'], approved: ['Validée', 'ok'], rejected: ['Refusée', 'bad'] };
  const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + dh(Math.abs(n));

  /* ---------- Mes crédits ---------- */
  T.route(/^\/credits$/, async () => {
    const c = await T.get('/credits'), P = c.prices, H = T.cfg.hand, pay = c.pay, neg = c.balance < 0;
    T.title('Mes crédits');
    const hasPay = pay.rib || pay.cashplus || pay.name;
    const html = `<div class="wrap sp"><div class="between" style="margin-bottom:8px"><h1 class="h2">Mes crédits</h1><a class="btn btn-line" href="/dressing">Mon dressing</a></div>
      <p class="muted" style="margin-bottom:20px">Les crédits paient les options pour vendre plus vite${H ? ' et les frais de la remise en main propre' : ''}. 1 crédit = 1 DH.</p>
      <div class="kpis" style="margin-bottom:24px"><div class="kpi${neg ? ' neg' : ''}"><small>Mon solde</small><b>${dh(c.balance)}</b><span>${neg ? `À régulariser. Au-delà de −${dh(c.limit)}, la main propre n'est plus proposée sur vos annonces.` : 'Disponible'}</span></div>
        <div class="kpi dark"><small>Remonter une annonce</small><b>${dh(P.bump)}</b><span>Elle repasse en tête des nouveautés (1 fois par ${P.bumpHours} h)</span></div>
        <div class="kpi dark"><small>À la une</small><b>${dh(P.feature)}</b><span>${P.featureDays} jours en tête du catalogue, avec le badge « À la une »</span></div>
        ${H ? `<div class="kpi dark"><small>Main propre</small><b>${T.pct(H.rate)}</b><span>${H.rate > 0 ? `Minimum ${dh(H.min)} par vente, prélevés à la commande, remboursés si elle est annulée` : 'Gratuit en ce moment'}</span></div>` : ''}</div>
      <div class="two"><form class="panel stack" data-form="topup" novalidate><h2>Recharger</h2>
        <div class="row" role="radiogroup" aria-label="Montant">${c.packs.map((p, i) => `<label class="chip-f" style="cursor:pointer"><input type="radio" name="pack" value="${p}"${i === 1 ? ' checked' : ''} style="accent-color:var(--cobalt)"> ${dh(p)}</label>`).join('')}<label class="chip-f" style="cursor:pointer"><input type="radio" name="pack" value="other" style="accent-color:var(--cobalt)"> Autre</label></div>
        <div id="f-other" hidden>${fld('amount', 'Montant (DH)', '<input class="in" id="amount" name="amount" type="number" min="20" max="2000" step="1" inputmode="numeric">', 'Entre 20 et 2 000 DH.')}</div>
        ${fld('method', 'Comment payez-vous ?', `<select class="in" id="method" name="method">${Object.entries(c.methods).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>`)}
        ${fld('reference', 'Référence du paiement', '<input class="in" id="reference" name="reference" maxlength="80" placeholder="N° de transfert, référence du virement…">', 'Elle nous permet de retrouver votre paiement. Vos crédits sont ajoutés dès que nous l\'avons reçu.')}
        <button class="btn btn-fill" type="submit">J'ai payé, créditer mon compte</button></form>
        <aside class="panel stack"><h2>Où payer</h2>${hasPay ? `${pay.name ? `<p><span class="small muted">Bénéficiaire</span><br><b>${esc(pay.name)}</b></p>` : ''}${pay.rib ? `<p><span class="small muted">RIB (virement)</span><br><b class="mono">${esc(pay.rib)}</b></p>` : ''}${pay.cashplus ? `<p><span class="small muted">CashPlus / Wafacash</span><br><b>${esc(pay.cashplus)}</b></p>` : ''}${pay.note ? `<p class="small">${esc(pay.note)}</p>` : ''}` : '<p class="alert warn small">Les coordonnées de paiement ne sont pas encore affichées. Écrivez-nous depuis la page d\'aide pour recharger.</p>'}
          <p class="small muted">Payez d'abord, puis envoyez la demande avec la référence. Les crédits servent uniquement aux services Thrifty : ils ne sont ni transférables ni convertibles. Un solde non utilisé est remboursé sur demande si vous fermez votre compte.</p></aside></div>
      ${c.topups.length ? `<h3 style="margin:28px 0 10px">Mes recharges</h3><div class="twrap"><table><thead><tr><th>Date</th><th class="r">Montant</th><th>Moyen</th><th>Référence</th><th>Statut</th></tr></thead><tbody>${c.topups.map((t) => `<tr><td>${T.dateFr(t.ts)}</td><td class="r">${dh(t.amount)}</td><td>${esc(t.methodLabel)}</td><td>${esc(t.reference || '—')}</td><td><span class="pill ${TOP_LBL[t.status][1]}">${TOP_LBL[t.status][0]}</span>${t.note ? `<br><span class="small muted">${esc(t.note)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <h3 style="margin:28px 0 10px">Historique</h3><div class="twrap"><table><thead><tr><th>Date</th><th>Opération</th><th class="r">Montant</th><th class="r">Solde</th></tr></thead><tbody>${c.tx.map((t) => `<tr><td>${T.dateFr(t.ts)}</td><td>${esc(t.label)}${t.note ? `<br><span class="small muted">${esc(t.note)}</span>` : ''}</td><td class="r"><b class="${t.amount < 0 ? 'neg' : 'pos'}">${sign(t.amount)}</b></td><td class="r">${dh(t.balance)}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${esc(DJ.empty)}.</td></tr>`}</tbody></table></div></div>`;
    return [html, (root) => {
      const f = $('form[data-form=topup]', root);
      const sync = () => { const other = (f.querySelector('input[name=pack]:checked') || {}).value === 'other'; $('#f-other', root).hidden = !other; const esp = f.method.value === 'especes'; $('#reference', root).placeholder = esp ? 'Facultatif pour les espèces' : 'N° de transfert, référence du virement…'; };
      f.addEventListener('change', sync); sync();
    }];
  }, { auth: true });
  T.forms.topup = async (f) => {
    T.fieldErr(f, ''); const d = T.formData(f), amount = d.pack === 'other' ? Number(d.amount) : Number(d.pack);
    try { await T.post('/credits/topup', { amount, method: d.method, reference: d.reference }); T.toast(`${DJ.thanks} ! Demande envoyée : vos crédits arrivent dès réception du paiement.`); T.render(); } catch (e) { T.fieldErr(f, e.message); }
  };

  /* ---------- Options payantes (depuis le dressing) ---------- */
  const option = (kind) => async (el) => {
    const P = T.cfg.credits, cost = kind === 'bump' ? P.bump : P.feature;
    const text = kind === 'bump' ? `L'annonce repasse en tête des nouveautés. ${dh(cost)} seront prélevés sur vos crédits.` : `L'annonce passe en tête du catalogue pendant ${P.featureDays} jours, avec le badge « À la une ». ${dh(cost)} seront prélevés sur vos crédits.`;
    if (!(await T.confirm(kind === 'bump' ? 'Remonter l\'annonce ?' : 'Mettre à la une ?', text, `Payer ${dh(cost)}`))) return;
    try { const r = await T.post(`/items/${el.dataset.id}/${kind}`); T.toast(`${DJ.done} ! Solde : ${dh(r.balance)}.`); T.render(); }
    catch (e) { T.toast(e.message); if (e.status === 402) T.go('/credits'); }
  };
  T.acts.ibump = option('bump'); T.acts.ifeature = option('feature');
  T.optionBtns = (i) => {
    if (i.status !== 'published' || !T.cfg.credits) return '';
    const P = T.cfg.credits, next = Math.max(i.bumpedAt || 0, i.created) + P.bumpHours * 3600000, canBump = Date.now() >= next;
    return `${canBump ? `<button class="btn btn-sm btn-line" data-act="ibump" data-id="${i.id}">Remonter · ${dh(P.bump)}</button>` : ''}<button class="btn btn-sm btn-line" data-act="ifeature" data-id="${i.id}">${i.featured ? 'Prolonger la une' : 'À la une'} · ${dh(P.feature)}</button>`;
  };
  T.optionInfo = (i) => (i.featured ? ` <span class="pill blue">À la une jusqu'au ${dShort(i.featuredUntil)}</span>` : '');

  /* ---------- Administration → Crédits ---------- */
  T.adminCredits = async () => {
    const c = await T.get('/admin/credits'), s = c.stats, pay = c.pay, P = c.prices;
    const pend = c.topups.filter((t) => t.status === 'pending'), done = c.topups.filter((t) => t.status !== 'pending');
    const tbl = (head, rows, empty) => `<div class="twrap"><table><thead><tr>${head.map((h) => `<th${h.startsWith('>') ? ' class="r"' : ''}>${esc(h.replace(/^>/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="muted">${esc(empty)}</td></tr>`}</tbody></table></div>`;
    return `<div class="kpis" style="margin-bottom:20px"><div class="kpi"><small>Crédits vendus</small><b>${dh(s.creditsSold)}</b><span>Argent reçu des vendeurs (recharges validées)</span></div><div class="kpi"><small>Options vendues</small><b>${dh(s.optionsSold)}</b><span>Remontées et mises à la une</span></div>
        <div class="kpi"><small>Frais main propre</small><b>${dh(s.handFees)}</b><span>Net des remboursements</span></div><div class="kpi dark"><small>Dettes vendeurs</small><b>${dh(s.debt)}</b><span>Soldes négatifs (découvert toléré : ${dh(c.limit)})</span></div></div>
      ${(pay.rib || pay.cashplus) ? '' : '<p class="alert warn" style="margin-bottom:16px">Renseignez vos coordonnées de paiement ci-dessous : sans elles, les vendeurs ne savent pas où payer leurs recharges.</p>'}
      <h3 style="margin-bottom:10px">Recharges à valider (${pend.length})</h3><p class="small muted" style="margin-bottom:10px">Validez seulement après avoir vu l'argent arriver (relevé bancaire, appli CashPlus). La validation ajoute les crédits immédiatement.</p>
      ${tbl(['Membre', '>Montant', 'Moyen', 'Référence', 'Date', 'Actions'], pend.map((t) => `<tr><td><a class="link" href="/vendeur/${t.user.id}">${esc(t.user.name)}</a><br><span class="small muted">${esc(t.user.phone || t.user.email)}</span></td><td class="r"><b>${dh(t.amount)}</b></td><td>${esc(t.methodLabel)}</td><td>${esc(t.reference || '—')}</td><td>${T.dateFr(t.ts)}</td><td><span class="row"><button class="btn btn-sm btn-fill" data-act="atopup" data-a="approve" data-id="${t.id}" data-amount="${t.amount}" data-name="${esc(t.user.name)}">Paiement reçu</button><button class="btn btn-sm btn-danger" data-act="atopup" data-a="reject" data-id="${t.id}">Refuser</button></span></td></tr>`), 'Aucune recharge en attente.')}
      <h3 style="margin:24px 0 10px">Soldes des membres</h3>
      ${tbl(['Membre', '>Solde', 'Actions'], c.balances.map((u) => `<tr><td>${esc(u.name)}<br><span class="small muted">${esc(u.email)}</span></td><td class="r"><b class="${u.credits < 0 ? 'neg' : ''}">${dh(u.credits)}</b></td><td><button class="btn btn-sm btn-line" data-act="acredit" data-id="${u.id}" data-name="${esc(u.name)}">Ajuster</button></td></tr>`), 'Aucun solde. Pour offrir des crédits à un membre : onglet Membres → « Crédits ».')}
      <form class="panel stack" style="max-width:560px;margin-top:24px" data-form="credset"><h3>Prix des options et coordonnées de paiement</h3>
        <div class="form-grid">${fld('cbump', 'Remonter (DH)', `<input class="in" id="cbump" name="bump" type="number" min="1" max="500" value="${P.bump}">`)}${fld('cfeat', 'À la une (DH)', `<input class="in" id="cfeat" name="feature" type="number" min="1" max="1000" value="${P.feature}">`)}${fld('cdays', 'Durée de la une (jours)', `<input class="in" id="cdays" name="featureDays" type="number" min="1" max="60" value="${P.featureDays}">`)}</div>
        ${fld('pname', 'Bénéficiaire', `<input class="in" id="pname" name="payName" maxlength="100" value="${esc(pay.name)}" placeholder="Nom du titulaire du compte">`)}
        ${fld('prib', 'RIB (24 chiffres)', `<input class="in" id="prib" name="payRib" maxlength="60" value="${esc(pay.rib)}">`)}
        ${fld('pcash', 'CashPlus / Wafacash', `<input class="in" id="pcash" name="payCashplus" maxlength="120" value="${esc(pay.cashplus)}" placeholder="Nom et téléphone du bénéficiaire">`)}
        ${fld('pnote', 'Message aux vendeurs (facultatif)', `<input class="in" id="pnote" name="payNote" maxlength="300" value="${esc(pay.note)}" placeholder="Ex. indiquez votre e-mail Thrifty dans le motif du virement">`)}
        <button class="btn btn-fill" type="submit">Enregistrer</button></form>
      ${done.length ? `<h3 style="margin:24px 0 10px">Recharges traitées</h3>${tbl(['Membre', '>Montant', 'Moyen', 'Référence', 'Statut', 'Date'], done.map((t) => `<tr><td>${esc(t.user.name)}</td><td class="r">${dh(t.amount)}</td><td>${esc(t.methodLabel)}</td><td>${esc(t.reference || '—')}</td><td><span class="pill ${TOP_LBL[t.status][1]}">${TOP_LBL[t.status][0]}</span></td><td>${T.dateFr(t.decided || t.ts)}</td></tr>`), '')}` : ''}`;
  };
  T.acts.atopup = async (el) => {
    const approve = el.dataset.a === 'approve';
    let note = '';
    if (approve) { if (!(await T.confirm('Paiement bien reçu ?', `${dh(Number(el.dataset.amount))} seront ajoutés aux crédits de ${el.dataset.name}. Validez seulement si l'argent est arrivé.`, 'Ajouter les crédits'))) return; }
    else { const r = await T.modal('<h3>Refuser la recharge</h3><form class="stack"><div class="field"><label for="tn">Motif (envoyé au membre)</label><input class="in" id="tn" name="note" maxlength="200" placeholder="Ex. aucun virement reçu avec cette référence"></div><div class="row"><button class="btn btn-danger" type="submit">Refuser</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>'); if (!r) return; note = r.note; }
    if (await T.run(() => T.post(`/admin/topups/${el.dataset.id}/${el.dataset.a}`, { note }), DJ.done + ' !')) T.render();
  };
  T.acts.acredit = async (el) => {
    const r = await T.modal(`<h3>Crédits de ${esc(el.dataset.name)}</h3><p class="muted small">Montant positif pour offrir ou corriger, négatif pour retirer. Le membre voit le motif.</p><form class="stack"><div class="field"><label for="ca">Montant (DH)</label><input class="in" id="ca" name="amount" type="number" min="-2000" max="2000" step="1" required></div><div class="field"><label for="cn">Motif</label><input class="in" id="cn" name="note" maxlength="200" required placeholder="Ex. crédits de bienvenue"></div><div class="row"><button class="btn btn-fill" type="submit">Appliquer</button><button class="btn btn-line" type="button" data-close="no">Annuler</button></div></form>`);
    if (r && (await T.run(() => T.post('/admin/credits/adjust', { userId: Number(el.dataset.id), amount: Number(r.amount), note: r.note }), DJ.done + ' !'))) T.render();
  };
  T.forms.credset = async (f) => {
    const d = T.formData(f);
    if (await T.run(() => T.post('/admin/credit-settings', { bump: Number(d.bump), feature: Number(d.feature), featureDays: Number(d.featureDays), payName: d.payName, payRib: d.payRib, payCashplus: d.payCashplus, payNote: d.payNote }), 'Réglages enregistrés.')) { Object.assign(T.cfg, await T.get('/config')); T.render(); }
  };
})();
