const elements = {
  metricGrid: document.querySelector('#metric-grid'),
  heroSnapshot: document.querySelector('#hero-snapshot'),
  sourceList: document.querySelector('#source-list'),
  cityList: document.querySelector('#city-list'),
  pipelineBoard: document.querySelector('#pipeline-board'),
  leadRows: document.querySelector('#lead-rows'),
  outreachList: document.querySelector('#outreach-list'),
  buyerList: document.querySelector('#buyer-list'),
  campaignList: document.querySelector('#campaign-list'),
  playbookList: document.querySelector('#playbook-list'),
  statusMessage: document.querySelector('#status-message'),
  leadForm: document.querySelector('#lead-form'),
  refreshButton: document.querySelector('#refresh-data'),
  dispatchButton: document.querySelector('#dispatch-outreach'),
  captureLink: document.querySelector('#capture-link'),
  exportLink: document.querySelector('#export-link'),
};

const stageOrder = ['qualified', 'new', 'review', 'routed', 'sold'];
const stageLabels = {
  qualified: 'Qualified',
  new: 'New',
  review: 'Review',
  routed: 'Routed',
  sold: 'Sold',
};

let currentData = null;

elements.refreshButton?.addEventListener('click', () => loadDashboard('Data refreshed.'));
elements.dispatchButton?.addEventListener('click', dispatchOutreach);
elements.leadForm?.addEventListener('submit', createLead);

loadDashboard();

async function loadDashboard(message) {
  const response = await fetch('/api/bootstrap');
  currentData = await response.json();
  renderDashboard(currentData);

  if (message) {
    flash(message);
  }
}

function renderDashboard(data) {
  const { product, metrics, leads, outreach, buyers, campaigns, playbooks } = data;

  document.title = `${product.name} Dashboard`;
  elements.captureLink.href = product.captureUrl;
  elements.exportLink.href = product.exportUrl;

  elements.metricGrid.innerHTML = buildMetricCards(metrics);
  elements.heroSnapshot.innerHTML = `
    <div class="snapshot-item">
      <span class="snapshot-kicker">Pipeline value</span>
      <strong>${formatCurrency(metrics.pipelineValue)}</strong>
    </div>
    <div class="snapshot-item">
      <span class="snapshot-kicker">Average lead score</span>
      <strong>${metrics.avgScore}</strong>
    </div>
    <div class="snapshot-item">
      <span class="snapshot-kicker">Queued outreach</span>
      <strong>${metrics.activeOutreach}</strong>
    </div>
  `;

  elements.sourceList.innerHTML = buildMixList(metrics.sourceMix);
  elements.cityList.innerHTML = buildMixList(metrics.cityMix);
  elements.pipelineBoard.innerHTML = buildPipeline(leads);
  elements.leadRows.innerHTML = buildLeadRows(leads);
  elements.outreachList.innerHTML = buildOutreachRows(outreach, leads);
  elements.buyerList.innerHTML = buildBuyerCards(buyers);
  elements.campaignList.innerHTML = buildCampaignCards(campaigns);
  elements.playbookList.innerHTML = buildPlaybooks(playbooks);

  bindLeadActions();
}

function buildMetricCards(metrics) {
  const cards = [
    { label: 'Total Leads', value: metrics.totalLeads, tone: 'warm' },
    { label: 'Qualified', value: metrics.qualifiedLeads, tone: 'cool' },
    { label: 'Routed', value: metrics.routedLeads, tone: 'cool' },
    { label: 'Sold', value: metrics.soldLeads, tone: 'warm' },
    { label: 'Compliance Review', value: metrics.reviewLeads, tone: 'muted' },
    { label: 'Pipeline Value', value: formatCurrency(metrics.pipelineValue), tone: 'warm' },
  ];

  return cards
    .map(
      (card, index) => `
        <article class="metric-card ${card.tone}" style="animation-delay:${index * 80}ms">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
        </article>
      `,
    )
    .join('');
}

function buildMixList(items) {
  const max = Math.max(...items.map((item) => item.count), 1);

  return items
    .map(
      (item) => `
        <article class="mix-row">
          <div class="mix-row-top">
            <span>${item.label}</span>
            <strong>${item.count}</strong>
          </div>
          <div class="meter">
            <span style="width:${Math.round((item.count / max) * 100)}%"></span>
          </div>
        </article>
      `,
    )
    .join('');
}

function buildPipeline(leads) {
  return stageOrder
    .map((status) => {
      const bucket = leads.filter((lead) => lead.status === status).slice(0, 5);

      return `
        <section class="pipeline-column">
          <div class="pipeline-column-head">
            <strong>${stageLabels[status]}</strong>
            <span>${leads.filter((lead) => lead.status === status).length}</span>
          </div>
          <div class="pipeline-cards">
            ${bucket
              .map(
                (lead) => `
                  <article class="lead-card">
                    <div class="lead-card-top">
                      <strong>${lead.name}</strong>
                      <span class="grade-pill">${lead.grade}</span>
                    </div>
                    <p>${lead.serviceLabel}</p>
                    <div class="tag-row">
                      <span>${lead.city}</span>
                      <span>${lead.source}</span>
                    </div>
                    <div class="lead-card-bottom">
                      <span>${lead.buyerName}</span>
                      <strong>${lead.score}</strong>
                    </div>
                  </article>
                `,
              )
              .join('')}
          </div>
        </section>
      `;
    })
    .join('');
}

function buildLeadRows(leads) {
  return leads
    .map(
      (lead) => `
        <tr>
          <td>
            <div class="table-lead">
              <strong>${lead.name}</strong>
              <span>${lead.city}</span>
            </div>
          </td>
          <td>${lead.serviceLabel}</td>
          <td>${lead.source}</td>
          <td><span class="score-pill">${lead.score}</span></td>
          <td>${lead.buyerName}</td>
          <td>
            <select class="status-select" data-lead-id="${lead.id}">
              ${stageOrder
                .map(
                  (status) => `
                    <option value="${status}" ${lead.status === status ? 'selected' : ''}>
                      ${stageLabels[status]}
                    </option>
                  `,
                )
                .join('')}
            </select>
          </td>
          <td>
            <div class="row-actions">
              <button class="mini-button note-button" data-lead-id="${lead.id}">Add note</button>
              <a class="mini-link" href="tel:${lead.phone || ''}">Call</a>
            </div>
          </td>
        </tr>
      `,
    )
    .join('');
}

function buildOutreachRows(outreach, leads) {
  if (!outreach.length) {
    return '<p class="empty-state">No outreach tasks queued yet.</p>';
  }

  return outreach
    .slice(0, 10)
    .map((task) => {
      const lead = leads.find((entry) => entry.id === task.leadId);

      return `
        <article class="outreach-row">
          <div>
            <strong>${lead?.name || 'Unknown lead'}</strong>
            <p>${task.channel.toUpperCase()} to ${task.audience}</p>
          </div>
          <div>
            <span class="tiny-label">Playbook</span>
            <p>${task.playbookId}</p>
          </div>
          <div>
            <span class="tiny-label">Scheduled</span>
            <p>${formatDateTime(task.scheduledFor)}</p>
          </div>
          <div>
            <span class="status-tag ${task.status}">${task.status}</span>
          </div>
        </article>
      `;
    })
    .join('');
}

function buildBuyerCards(buyers) {
  return buyers
    .map(
      (buyer) => `
        <article class="buyer-card">
          <div class="buyer-card-top">
            <strong>${buyer.name}</strong>
            <span>${formatCurrency(buyer.pricePerLead)}/lead</span>
          </div>
          <p>${buyer.serviceLabels.join(' / ')}</p>
          <div class="tag-row">
            ${buyer.territories.map((territory) => `<span>${territory}</span>`).join('')}
          </div>
          <div class="buyer-stats">
            <span>Load ${buyer.currentLoad}</span>
            <span>Capacity ${buyer.openCapacity}</span>
          </div>
        </article>
      `,
    )
    .join('');
}

function buildCampaignCards(campaigns) {
  return campaigns
    .map(
      (campaign) => `
        <article class="campaign-card">
          <div class="campaign-card-top">
            <strong>${campaign.name}</strong>
            <span class="status-tag ${campaign.status}">${campaign.status}</span>
          </div>
          <p>${campaign.source}</p>
          <div class="campaign-metrics">
            <span>Spend ${formatCurrency(campaign.spend)}</span>
            <span>CPL ${formatCurrency(campaign.currentCpl)}</span>
            <span>Target ${campaign.dailyLeadTarget}/day</span>
          </div>
          <div class="tag-row">
            ${campaign.cities.map((city) => `<span>${city}</span>`).join('')}
          </div>
        </article>
      `,
    )
    .join('');
}

function buildPlaybooks(playbooks) {
  return playbooks
    .map(
      (playbook) => `
        <article class="playbook-card">
          <strong>${playbook.name}</strong>
          <p>${playbook.serviceTypes.join(', ')}</p>
          <div class="tiny-list">
            ${playbook.steps
              .map((step) => `<span>${step.delayMinutes}m · ${step.channel} · ${step.audience}</span>`)
              .join('')}
          </div>
        </article>
      `,
    )
    .join('');
}

function bindLeadActions() {
  document.querySelectorAll('.status-select').forEach((select) => {
    select.addEventListener('change', async (event) => {
      const leadId = event.target.dataset.leadId;
      await fetch(`/api/leads/${leadId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: event.target.value }),
      });

      await loadDashboard('Lead status updated.');
    });
  });

  document.querySelectorAll('.note-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const note = window.prompt('Add an operator note');
      if (!note) {
        return;
      }

      await fetch(`/api/leads/${button.dataset.leadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });

      await loadDashboard('Operator note saved.');
    });
  });
}

async function createLead(event) {
  event.preventDefault();

  const formData = new FormData(elements.leadForm);
  const payload = Object.fromEntries(formData.entries());
  payload.consentGiven = formData.get('consentGiven') === 'on';

  await fetch('/api/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  elements.leadForm.reset();
  await loadDashboard('Lead created and queued.');
}

async function dispatchOutreach() {
  await fetch('/api/outreach/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 6 }),
  });

  await loadDashboard('Next outreach batch dispatched.');
}

function flash(message) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.add('visible');

  window.clearTimeout(flash.timeoutId);
  flash.timeoutId = window.setTimeout(() => {
    elements.statusMessage.classList.remove('visible');
  }, 2600);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
