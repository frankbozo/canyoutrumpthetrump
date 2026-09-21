/* =================================================================
   Can You Trump the Trump — client
   No framework, no build step. Renders into #app based on data-view.
   ================================================================= */

const app = document.getElementById('app');
const VIEW = app.dataset.view;
const BOOT = JSON.parse(document.getElementById('bootstrap').textContent || '{}');

/* ---------- tiny helpers ---------- */

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
};

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || 'Request failed'), { data, status: res.status });
  return data;
}

function ago(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

const longDate = () =>
  new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

/* ---------- shared chrome ---------- */

function chrome(current, inner) {
  return `
<header class="masthead">
  <div class="wrap masthead__inner">
    <h1 class="masthead__title"><a href="/">Can You Trump the Trump?</a></h1>
    <span class="badge-satire">Satire</span>
    <p class="masthead__tag">The news is unbelievable. Try to do worse.</p>
  </div>
  <div class="wrap dateline mono">
    <span>Wire Desk &middot; Vol. 1</span>
    <span>${esc(longDate())}</span>
  </div>
  <div class="wrap">
    <nav class="sections" aria-label="Sections">
      <a href="/" ${current === 'feed' ? 'aria-current="page"' : ''}>The Wire</a>
      <a href="/reality" ${current === 'reality' ? 'aria-current="page"' : ''}>Overtaken by Reality</a>
      <a href="/submit" ${current === 'submit' ? 'aria-current="page"' : ''}>File a Proposal</a>
      <span class="spacer"></span>
      <a href="/about" ${current === 'about' ? 'aria-current="page"' : ''}>About</a>
    </nav>
  </div>
</header>
<main id="main"><div class="wrap">${inner}</div></main>
<footer>
  <div class="wrap">
    <div class="links mono">
      <a href="/about">About</a><a href="/terms">Terms &amp; Takedowns</a><a href="/submit">File a Proposal</a>
    </div>
    <p class="disclaimer">
      <strong>This is a work of satire.</strong> Every proposal on this site is invented by a
      member of the public as a joke. Nothing here is a real policy, a real quote, or a real
      statement by any real person, and nothing here is reported as news.
    </p>
    <p class="rider">
      <span class="rider__label">Notice to President DJT</span>
      For any money you make from ideas on this site, I expect a 50% cut.
      Open to negotiating a deal.
    </p>
    <p class="made">Proudly created in Canada &#127809;</p>
  </div>
</footer>`;
}

function render(current, inner) {
  app.innerHTML = chrome(current, inner);
}

/* ---------- post rendering ---------- */

function plausMarkup(p) {
  if (p.plausibility === null) return '';
  const high = p.plausibility >= 60 ? ' high' : '';
  return `<span class="plaus" title="${p.plausibilityVotes} readers rated how likely this actually is">
    <span>Plausibility</span>
    <span class="plaus__bar"><span class="plaus__fill${high}" style="width:${p.plausibility}%"></span></span>
    <span class="plaus__val">${p.plausibility}%</span>
  </span>`;
}

function itemMarkup(p) {
  const cls = ['item', p.blackMarked ? 'is-marked' : '', p.overtaken ? 'is-overtaken' : ''].filter(Boolean).join(' ');
  return `
<li class="${cls}" data-id="${p.id}">
  <div class="rail">
    <button class="vote-up" aria-label="Upvote" aria-pressed="${p.myVote === 1}">&#9650;</button>
    <span class="score num ${p.net > 0 ? 'pos' : p.net < 0 ? 'neg' : ''}">${p.net > 0 ? '+' : ''}${p.net}</span>
    <button class="vote-down" aria-label="Downvote" aria-pressed="${p.myVote === -1}">&#9660;</button>
  </div>
  <div>
    <h2 class="item__head">
      <a href="/p/${esc(p.slug)}">${esc(p.headline)}</a>
      ${p.overtaken ? '<span class="stamp">&#9635; Overtaken by reality</span>' : ''}
      ${p.blackMarked ? '<span class="stamp is-mark" title="The community judged this one intellectually insufficient.">&#9632; Black mark</span>' : ''}
    </h2>
    ${p.body ? `<p class="item__lede">${esc(p.body.slice(0, 220))}${p.body.length > 220 ? '&hellip;' : ''}</p>` : ''}
    <div class="item__meta">
      <span>Filed by ${esc(p.author)}</span>
      <span class="sep">&middot;</span>
      <span>${ago(p.createdAt)}</span>
      <span class="sep">&middot;</span>
      <a href="/p/${esc(p.slug)}">${p.commentCount} comment${p.commentCount === 1 ? '' : 's'}</a>
      ${p.plausibility !== null ? '<span class="sep">&middot;</span>' + plausMarkup(p) : ''}
    </div>
  </div>
</li>`;
}

/* ---------- interactions wired by delegation ---------- */

function wireVoting(root) {
  root.addEventListener('click', async (e) => {
    const up = e.target.closest('.vote-up');
    const down = e.target.closest('.vote-down');
    if (!up && !down) return;
    const li = e.target.closest('[data-id]');
    if (!li) return;
    const dir = up ? 1 : -1;
    try {
      const { post } = await api(`/api/posts/${li.dataset.id}/vote`, { method: 'POST', body: { dir } });
      const score = li.querySelector('.score');
      score.textContent = `${post.net > 0 ? '+' : ''}${post.net}`;
      score.className = `score num ${post.net > 0 ? 'pos' : post.net < 0 ? 'neg' : ''}`;
      li.querySelector('.vote-up').setAttribute('aria-pressed', String(post.myVote === 1));
      li.querySelector('.vote-down').setAttribute('aria-pressed', String(post.myVote === -1));
      li.classList.toggle('is-marked', post.blackMarked);
    } catch (err) {
      flash(err.message);
    }
  });
}

let flashTimer;
function flash(message, ok = false) {
  document.querySelector('.flash')?.remove();
  const el = h(`<div class="notice ${ok ? 'notice--ok' : ''} flash">${esc(message)}</div>`).firstElementChild;
  document.querySelector('main .wrap').prepend(el);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.remove(), 6000);
  el.scrollIntoView({ block: 'nearest' });
}

/* =================================================================
   Views
   ================================================================= */

async function viewFeed() {
  let sort = new URLSearchParams(location.search).get('sort') || 'hot';
  if (!['hot', 'new', 'top'].includes(sort)) sort = 'hot';

  render('feed', `
    <div class="sorts">
      <button data-sort="hot" aria-pressed="${sort === 'hot'}">Hot</button>
      <button data-sort="new" aria-pressed="${sort === 'new'}">Newest</button>
      <button data-sort="top" aria-pressed="${sort === 'top'}">All-time</button>
      <span class="count" id="count"></span>
    </div>
    <ul class="feed" id="feed"></ul>
    <p class="loading" id="loading">Reading the wire&hellip;</p>
  `);

  const feed = document.getElementById('feed');
  wireVoting(feed);

  document.querySelector('.sorts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (b) location.search = `?sort=${b.dataset.sort}`;
  });

  try {
    const data = await api(`/api/posts?sort=${sort}`);
    document.getElementById('loading').remove();
    document.getElementById('count').textContent = `${data.total} on file`;

    if (!data.posts.length) {
      feed.replaceWith(h(`
        <div class="empty">
          <h2>The wire is empty.</h2>
          <p>
            No proposals on file yet. The first one sets the tone for everything after it,
            so make it count &mdash; and remember the bar: it has to be less believable than
            what actually happened this week.
          </p>
          <a class="btn" href="/submit">File the first proposal</a>
        </div>`));
      return;
    }
    feed.innerHTML = data.posts.map(itemMarkup).join('');
  } catch (err) {
    document.getElementById('loading').textContent = 'Could not reach the wire. Refresh to try again.';
  }
}

async function viewReality() {
  render('reality', `
    <div class="article">
      <p class="article__slug mono">Standing Archive</p>
      <h2 class="article__head">Overtaken by Reality</h2>
      <p class="article__body">
        Proposals that readers invented as jokes, and that the news subsequently
        caught up with. Each one carries the sources that confirmed it. This page
        writes itself.
      </p>
    </div>
    <ul class="feed" id="feed"></ul>
    <p class="loading" id="loading">Checking the record&hellip;</p>
  `);

  const feed = document.getElementById('feed');
  wireVoting(feed);

  try {
    const data = await api('/api/reality');
    document.getElementById('loading').remove();
    if (!data.posts.length) {
      feed.replaceWith(h(`
        <div class="empty">
          <h2>Reality is, for now, behind.</h2>
          <p>
            Nothing on the wire has been overtaken yet. When three readers independently
            flag a proposal as already having happened &mdash; each with a source &mdash;
            it lands here permanently.
          </p>
          <a class="btn btn--quiet" href="/">Back to the wire</a>
        </div>`));
      return;
    }
    feed.innerHTML = data.posts.map((p) => `
      ${itemMarkup(p)}
      ${p.sources.length ? `<li class="sources"><h2>Confirmed by</h2><ol>${
        p.sources.map((s) => `<li><a href="${esc(s.source_url)}" rel="nofollow noopener" target="_blank">${esc(new URL(s.source_url).hostname.replace(/^www\./, ''))}</a>${s.note ? ` &mdash; ${esc(s.note)}` : ''}</li>`).join('')
      }</ol></li>` : ''}
    `).join('');
  } catch {
    document.getElementById('loading').textContent = 'Could not load the archive.';
  }
}

async function viewPost() {
  render('post', '<p class="loading">Pulling the file&hellip;</p>');
  let data;
  try {
    data = await api(`/api/posts/${encodeURIComponent(BOOT.slug)}`);
  } catch {
    render('post', '<div class="empty"><h2>No such proposal.</h2><p>It may have been withdrawn.</p><a class="btn btn--quiet" href="/">Back to the wire</a></div>');
    return;
  }

  const p = data.post;
  const flagged = p.iFlagged;

  render('post', `
  <article class="article" data-id="${p.id}">
    <p class="article__slug mono">
      Proposal &middot; Filed ${ago(p.createdAt)} &middot; ${esc(p.author)}
      ${p.overtaken ? ' &middot; <span class="stamp">&#9635; Overtaken by reality</span>' : ''}
      ${p.blackMarked ? ' &middot; <span class="stamp is-mark">&#9632; Black mark</span>' : ''}
    </p>
    <h2 class="article__head">${esc(p.headline)}</h2>
    <div class="article__body">${p.body ? esc(p.body).split('\n').filter(Boolean).map((x) => `<p>${x}</p>`).join('') : '<p><em>Filed without elaboration.</em></p>'}</div>

    <div class="actionbar">
      <span class="rail" style="flex-direction:row;align-items:center;gap:.5rem">
        <button class="vote-up" aria-label="Upvote" aria-pressed="${p.myVote === 1}">&#9650;</button>
        <span class="score num ${p.net > 0 ? 'pos' : p.net < 0 ? 'neg' : ''}">${p.net > 0 ? '+' : ''}${p.net}</span>
        <button class="vote-down" aria-label="Downvote" aria-pressed="${p.myVote === -1}">&#9660;</button>
      </span>
      <button class="reality-btn" id="reality" aria-pressed="${flagged}">
        &#9635; ${flagged ? 'You flagged this' : 'This already happened'}
      </button>
      <button class="btn btn--quiet" id="share">Share</button>
      <button class="btn btn--quiet" id="report">Report</button>
    </div>

    <div class="field" style="max-width:22rem">
      <label for="plaus">How likely is this, really?</label>
      <input type="range" id="plaus" min="0" max="100" step="5" value="${p.myPlausibility ?? p.plausibility ?? 50}">
      <span class="hint" id="plaus-out">${
        p.plausibility === null
          ? 'No ratings yet. Set the index.'
          : `Crowd average <strong>${p.plausibility}%</strong> from ${p.plausibilityVotes} rating${p.plausibilityVotes === 1 ? '' : 's'}.`
      }</span>
    </div>

    ${data.sources.length ? `<div class="sources"><h2>Reality checks on file</h2><ol>${
      data.sources.map((s) => `<li><a href="${esc(s.source_url)}" rel="nofollow noopener" target="_blank">${esc(new URL(s.source_url).hostname.replace(/^www\./, ''))}</a>${s.note ? ` &mdash; ${esc(s.note)}` : ''}</li>`).join('')
    }</ol></div>` : ''}

    <section class="comments">
      <h2>${data.comments.length} comment${data.comments.length === 1 ? '' : 's'}</h2>
      <div id="comment-list">${data.comments.map(commentMarkup).join('') || '<p class="empty-line">Nobody has weighed in.</p>'}</div>
      <form class="form" id="comment-form" style="margin-top:1.5rem">
        <div class="field">
          <label for="c-body">Add a comment</label>
          <textarea id="c-body" name="body" required maxlength="1000" placeholder="Keep it sharper than the proposal."></textarea>
        </div>
        <div class="field">
          <label for="c-author">Byline</label>
          <input type="text" id="c-author" name="author" maxlength="40" placeholder="Anonymous Citizen">
        </div>
        <button class="btn" type="submit">Post comment</button>
      </form>
    </section>
  </article>

  <dialog id="share-dialog"><div class="dialog__inner">
    <h2 class="section-title">Share this proposal</h2>
    <div class="share-preview" id="share-preview"></div>
    <div class="dialog__actions">
      <button class="btn" id="copy-text">Copy text</button>
      <button class="btn btn--quiet" id="copy-link">Copy link</button>
      <button class="btn btn--quiet" id="save-image">Save image</button>
      <button class="btn btn--quiet" id="close-share">Close</button>
    </div>
  </div></dialog>
  `);

  const article = document.querySelector('.article');
  wireVoting(article);

  /* Reality Check */
  document.getElementById('reality').addEventListener('click', async () => {
    const url = prompt('Link to the real story that makes this true:');
    if (!url) return;
    const note = prompt('One line of context (optional):') || '';
    try {
      const r = await api(`/api/posts/${p.id}/reality`, { method: 'POST', body: { source_url: url, note } });
      flash(r.message, true);
      if (r.post.overtaken) setTimeout(() => location.reload(), 1200);
    } catch (err) { flash(err.message); }
  });

  /* Plausibility */
  const slider = document.getElementById('plaus');
  const out = document.getElementById('plaus-out');
  let plausTimer;
  slider.addEventListener('input', () => {
    out.innerHTML = `Your rating: <strong>${slider.value}%</strong>`;
    clearTimeout(plausTimer);
    plausTimer = setTimeout(async () => {
      try {
        const r = await api(`/api/posts/${p.id}/plausibility`, { method: 'POST', body: { score: Number(slider.value) } });
        out.innerHTML = `Crowd average <strong>${r.post.plausibility}%</strong> from ${r.post.plausibilityVotes} rating${r.post.plausibilityVotes === 1 ? '' : 's'}.`;
      } catch (err) { flash(err.message); }
    }, 500);
  });

  /* Comments */
  document.getElementById('comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api(`/api/posts/${p.id}/comments`, {
        method: 'POST',
        body: { body: f.body.value, author: f.author.value },
      });
      if (r.pending) {
        flash('Held for review. A human will look at it shortly.', true);
      } else {
        const list = document.getElementById('comment-list');
        if (list.querySelector('.empty-line')) list.innerHTML = '';
        list.insertAdjacentHTML('beforeend', commentMarkup(r.comment));
      }
      f.reset();
    } catch (err) { flash(err.message); }
    btn.disabled = false;
  });

  /* Report */
  document.getElementById('report').addEventListener('click', async () => {
    const reason = prompt('What is wrong with this one?');
    if (reason === null) return;
    try {
      const r = await api('/api/report', { method: 'POST', body: { post_id: p.id, reason } });
      flash(r.message, true);
    } catch (err) { flash(err.message); }
  });

  /* Share */
  wireShare(p);
}

function commentMarkup(c) {
  return `<div class="comment">
    <p class="comment__meta mono">${esc(c.author)} &middot; ${ago(c.created_at)}</p>
    <p class="comment__body">${esc(c.body)}</p>
  </div>`;
}

/* ---------- share card: drawn client-side, watermark included ---------- */

function wireShare(p) {
  const dialog = document.getElementById('share-dialog');
  const link = `${location.origin}/p/${p.slug}`;
  const text = `"${p.headline}" — filed on Can You Trump the Trump (satire). ${link}`;

  document.getElementById('share-preview').innerHTML = `
    <p class="mono" style="color:var(--accent);margin:0 0 .5rem">Satire &middot; Can You Trump the Trump</p>
    <p style="font-size:1.15rem;font-weight:600;line-height:1.25;margin:0 0 .5rem">${esc(p.headline)}</p>
    <p class="mono" style="color:var(--muted);margin:0">${p.net > 0 ? '+' : ''}${p.net} &middot; ${p.plausibility !== null ? `${p.plausibility}% plausible` : 'unrated'}</p>`;

  document.getElementById('share').addEventListener('click', async () => {
    if (navigator.share) {
      try { await navigator.share({ title: p.headline, text, url: link }); return; } catch { /* fall through */ }
    }
    dialog.showModal();
  });
  document.getElementById('close-share').addEventListener('click', () => dialog.close());
  document.getElementById('copy-link').addEventListener('click', () => copy(link, 'Link copied.'));
  document.getElementById('copy-text').addEventListener('click', () => copy(text, 'Text copied.'));
  document.getElementById('save-image').addEventListener('click', () => saveShareImage(p));
}

async function copy(value, message) {
  try { await navigator.clipboard.writeText(value); flash(message, true); }
  catch { flash('Could not copy — select the text manually.'); }
}

// Draws the share image on a canvas. The SATIRE label is baked into the
// pixels, so it survives being screenshotted and reposted without context.
function saveShareImage(p) {
  const W = 1200, H = 630, PAD = 80;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  x.fillStyle = '#FBFAF7'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#DEDCD6'; x.lineWidth = 2;
  x.strokeRect(PAD / 2, PAD / 2, W - PAD, H - PAD);

  x.fillStyle = '#B5201B';
  x.font = '600 22px "IBM Plex Mono", monospace';
  x.fillText('SATIRE — NOT A REAL POLICY', PAD, PAD + 24);

  x.fillStyle = '#16161A';
  x.font = '600 58px Newsreader, Georgia, serif';
  const words = p.headline.split(' ');
  let line = '', y = PAD + 130;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (x.measureText(test).width > W - PAD * 2 && line) { x.fillText(line, PAD, y); y += 70; line = w; }
    else line = test;
    if (y > H - PAD - 120) break;
  }
  if (line) x.fillText(line, PAD, y);

  x.fillStyle = '#6B6B74';
  x.font = '400 24px "IBM Plex Mono", monospace';
  x.fillText(`${p.net > 0 ? '+' : ''}${p.net}  ·  ${p.plausibility !== null ? `${p.plausibility}% PLAUSIBLE` : 'UNRATED'}  ·  FILED BY ${p.author.toUpperCase()}`, PAD, H - PAD - 46);

  x.fillStyle = '#16161A';
  x.font = '600 26px Newsreader, Georgia, serif';
  x.fillText('canyoutrumpthetrump.com', PAD, H - PAD + 2);

  c.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${p.slug}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    flash('Image saved.', true);
  });
}

/* ---------- submit ---------- */

function viewSubmit() {
  render('submit', `
    <div class="article">
      <p class="article__slug mono">Wire Desk</p>
      <h2 class="article__head">File a Proposal</h2>
      <p class="article__body">
        One rule: it has to be less believable than what actually happened this week.
        Write it straight, the way a real bulletin would. The deadpan is the joke.
      </p>
    </div>
    <form class="form" id="submit-form">
      <div class="field">
        <label for="headline">Headline</label>
        <input type="text" id="headline" name="headline" required minlength="10" maxlength="180"
               placeholder="Mandate that all federal signage be rendered in Comic Sans">
        <span class="hint">Present tense, no punchline. Let the reader find it.</span>
      </div>
      <div class="field">
        <label for="body">Supporting text</label>
        <textarea id="body" name="body" maxlength="1200"
                  placeholder="Two or three sentences of straight-faced justification."></textarea>
      </div>
      <div class="field">
        <label for="desk">Desk</label>
        <select id="desk" name="desk">
          <option value="general">General</option>
          <option value="economy">Economy</option>
          <option value="foreign">Foreign Desk</option>
          <option value="interior">The Interior</option>
          <option value="ceremonial">Ceremonial Affairs</option>
          <option value="justice">Justice</option>
        </select>
      </div>
      <div class="field">
        <label for="author">Byline</label>
        <input type="text" id="author" name="author" maxlength="40" placeholder="Anonymous Citizen">
        <span class="hint">A pen name. Don't use a real person's name.</span>
      </div>
      <p class="notice">
        Submissions are reviewed before they go on the wire. Keep it to invented policy:
        no real quotes, no real private individuals, nothing about violence.
      </p>
      <button class="btn" type="submit">Transmit proposal</button>
    </form>
  `);

  document.getElementById('submit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('/api/posts', {
        method: 'POST',
        body: {
          headline: f.headline.value, body: f.body.value,
          author: f.author.value, desk: f.desk.value,
        },
      });
      if (r.pending) {
        f.reset();
        flash(r.message, true);
      } else {
        location.href = `/p/${r.post.slug}`;
      }
    } catch (err) {
      flash(err.message);
      if (err.data?.slug) flash(`Already filed — see /p/${err.data.slug}`);
    }
    btn.disabled = false;
  });
}

/* ---------- static pages ---------- */

function viewAbout() {
  render('about', `
    <div class="article">
      <p class="article__slug mono">Masthead</p>
      <h2 class="article__head">About this wire</h2>
      <div class="article__body">
        <p>
          The premise is a complaint dressed up as a game. The news has gotten hard to
          believe, so this site asks you to try and beat it: propose something a government
          might plausibly do that it hasn't done yet, and write it as straight as a real bulletin.
        </p>
        <p>
          Readers vote. Proposals that clear the bar rise. Proposals the room finds lazy
          collect a <strong>black mark</strong> &mdash; that takes at least ten votes, so a
          new submission can't be buried by two people in a bad mood.
        </p>
        <p>
          The part that matters is the <strong>Reality Check</strong>. If a proposal stops
          being a joke &mdash; if the thing actually happens &mdash; any reader can flag it
          with a link to the real story. Three independent flags move it permanently to
          <a href="/reality">Overtaken by Reality</a>. That archive is the actual argument
          this site is making, and it writes itself.
        </p>
        <p>
          If you believe you can outdo what is actually happening, that is a remarkable
          claim and almost certainly an unachievable one. File anyway.
        </p>
        <p>
          <strong>The standing offer.</strong> Three proposals moved to
          <a href="/reality">Overtaken by Reality</a> is the quota. If you hit the quota,
          we should talk &mdash; <a href="mailto:ryan@hypnoticmindscapes.com">ryan@hypnoticmindscapes.com</a>.
          There's a bigger thing to build here: Kalshi and Polymarket let you bet on what
          happens, and we'd rather build the version that pays the people who saw it coming.
          You need to do worse.
        </p>
        <p>
          Everything here is invented by members of the public as satire. Nothing on this
          site is a real policy, a real quote, or a real statement by anyone. If something
          slipped through that shouldn't have, the <a href="/terms">takedown page</a> tells
          you how to get it removed.
        </p>
      </div>
    </div>`);
}

function viewTerms() {
  render('terms', `
    <div class="article">
      <p class="article__slug mono">Legal</p>
      <h2 class="article__head">Terms &amp; Takedowns</h2>
      <div class="article__body">
        <p><strong>What this site is.</strong> A satire and parody forum. Every proposal is
        fiction submitted by a member of the public. Nothing here is news, nothing here is a
        real quote, and nothing here should be understood as a factual claim about any
        person, living or dead.</p>

        <p><strong>What you may not post.</strong> Real quotes attributed to real people.
        Anything about a private individual. Threats, incitement, or calls for violence
        against anyone. Content sexualising minors. Personal information &mdash; addresses,
        phone numbers, ID or account numbers. Impersonation of a real person or outlet.</p>

        <p><strong>Moderation.</strong> Submissions are reviewed before publication. Anything
        can be removed at any time for any reason. Reported items are reviewed by a human.</p>

        <p><strong>Takedowns.</strong> If something here names you, misrepresents you, or
        infringes your rights, write to the address below with a link to the item and what
        is wrong with it. Removals are processed promptly and without argument.</p>

        <p class="mono" style="text-transform:none;letter-spacing:0;font-size:.9rem">
          &#9635; Replace this line with your contact address before launch.
        </p>

        <p><strong>Privacy.</strong> The site sets one cookie: a random identifier so your
        votes stick and you can't vote twice. No accounts, no email addresses, no tracking
        or advertising pixels. Server logs hold IP addresses briefly for rate limiting.</p>

        <p><strong>Royalties.</strong> Notice to President DJT: for any money you make from
        ideas on this site, I expect a 50% cut. Open to negotiating a deal.</p>
      </div>
    </div>`);
}

function viewNotFound() {
  render('notfound', `
    <div class="empty">
      <h2>No such page.</h2>
      <p>The file you asked for isn't in the cabinet.</p>
      <a class="btn btn--quiet" href="/">Back to the wire</a>
    </div>`);
}

function viewError() {
  render('error', `
    <div class="empty">
      <h2>Something broke on our end.</h2>
      <p>Not your fault. Try again in a moment.</p>
      <a class="btn btn--quiet" href="/">Back to the wire</a>
    </div>`);
}

/* ---------- admin ---------- */

async function viewAdmin() {
  const load = async () => {
    try { return await api('/api/admin/queue'); }
    catch { return null; }
  };

  let data = await load();

  if (!data) {
    render('admin', `
      <div class="article"><h2 class="article__head">Desk Editor</h2></div>
      <form class="form" id="login">
        <div class="field">
          <label for="key">Admin key</label>
          <input type="password" id="key" name="key" required autocomplete="current-password">
        </div>
        <button class="btn" type="submit">Sign in</button>
      </form>`);
    document.getElementById('login').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/admin/login', { method: 'POST', body: { key: e.target.key.value } });
        location.reload();
      } catch { flash('Wrong key.'); }
    });
    return;
  }

  const draw = () => {
    render('admin', `
      <div class="article">
        <p class="article__slug mono">${data.liveCount} live &middot; ${data.posts.length} pending &middot; ${data.reports.length} reports</p>
        <h2 class="article__head">Desk Editor</h2>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true" data-tab="posts">Pending proposals (${data.posts.length})</button>
        <button role="tab" aria-selected="false" data-tab="comments">Comments (${data.comments.length})</button>
        <button role="tab" aria-selected="false" data-tab="reports">Reports (${data.reports.length})</button>
      </div>
      <div id="panel"></div>`);

    const panel = document.getElementById('panel');
    const panels = {
      posts: () => data.posts.length
        ? data.posts.map((p) => `
          <div class="queue-item" data-id="${p.id}" data-kind="post">
            <h3>${esc(p.headline)}</h3>
            <p class="mono" style="color:var(--muted)">${esc(p.author)} &middot; ${esc(p.desk)} &middot; ${ago(p.createdAt)}</p>
            ${p.body ? `<p>${esc(p.body)}</p>` : ''}
            <div class="actions">
              <button class="btn" data-act="approve">Approve</button>
              <button class="btn btn--quiet" data-act="reject">Reject</button>
              <button class="btn btn--quiet" data-act="delete">Delete</button>
            </div>
          </div>`).join('')
        : '<p class="empty-line">Queue is clear.</p>',
      comments: () => data.comments.length
        ? data.comments.map((c) => `
          <div class="queue-item" data-id="${c.id}" data-kind="comment">
            <h3>On &ldquo;${esc(c.headline)}&rdquo;</h3>
            <p>${esc(c.body)}</p>
            <p class="mono" style="color:var(--muted)">${esc(c.author)} &middot; ${ago(c.created_at)}</p>
            <div class="actions">
              <button class="btn" data-act="approve">Approve</button>
              <button class="btn btn--quiet" data-act="delete">Delete</button>
            </div>
          </div>`).join('')
        : '<p class="empty-line">Nothing held.</p>',
      reports: () => data.reports.length
        ? data.reports.map((r) => `
          <div class="queue-item">
            <h3>${r.slug ? `<a href="/p/${esc(r.slug)}">${esc(r.headline)}</a>` : 'Comment report'}</h3>
            <p>${esc(r.reason) || '<em>No reason given.</em>'}</p>
            <p class="mono" style="color:var(--muted)">${ago(r.created_at)}</p>
          </div>`).join('')
        : '<p class="empty-line">No reports.</p>',
    };

    panel.innerHTML = panels.posts();

    document.querySelector('.tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      document.querySelectorAll('[role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
      panel.innerHTML = panels[b.dataset.tab]();
    });

    panel.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const item = b.closest('[data-id]');
      const kind = item.dataset.kind === 'post' ? 'posts' : 'comments';
      b.disabled = true;
      try {
        await api(`/api/admin/${kind}/${item.dataset.id}/${b.dataset.act}`, { method: 'POST' });
        item.remove();
      } catch (err) { flash(err.message); b.disabled = false; }
    });
  };

  draw();
}

/* ---------- dispatch ---------- */

const VIEWS = {
  feed: viewFeed,
  reality: viewReality,
  post: viewPost,
  submit: viewSubmit,
  about: viewAbout,
  terms: viewTerms,
  admin: viewAdmin,
  notfound: viewNotFound,
  error: viewError,
};

(VIEWS[VIEW] || viewNotFound)();
