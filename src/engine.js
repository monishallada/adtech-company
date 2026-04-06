import crypto from 'node:crypto';

const serviceCatalog = {
  detailing: { label: 'Auto Detailing', score: 14 },
  'lawn-care': { label: 'Lawn Care', score: 12 },
  'pressure-washing': { label: 'Pressure Washing', score: 11 },
  'window-cleaning': { label: 'Window Cleaning', score: 10 },
};

const sourceWeights = {
  'meta lead ads': 16,
  'google search': 18,
  'landing page': 12,
  'website form': 12,
  'partner referral': 11,
  organic: 8,
  import: 6,
  'facebook group': 7,
};

const urgencyWeights = {
  today: 14,
  'this-week': 10,
  'this-month': 6,
  researching: 2,
};

const budgetWeights = {
  premium: 12,
  mid: 8,
  value: 4,
  unknown: 3,
};

const propertyWeights = {
  homeowner: 10,
  renter: 3,
  commercial: 8,
  unknown: 4,
};

const statusSort = ['qualified', 'new', 'review', 'routed', 'sold'];

export function createLeadRecord(payload, store) {
  const normalized = normalizeLeadPayload(payload);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const scoreBreakdown = scoreLead(normalized, store.buyers);

  const lead = {
    id,
    createdAt,
    updatedAt: createdAt,
    ...normalized,
    score: scoreBreakdown.score,
    grade: scoreBreakdown.grade,
    scoreReasons: scoreBreakdown.reasons,
    buyerId: null,
    status: normalized.consentGiven ? (scoreBreakdown.score >= 78 ? 'qualified' : 'new') : 'review',
    pricePerLead: 0,
    notes: normalized.message
      ? [
          {
            id: crypto.randomUUID(),
            text: normalized.message,
            createdAt,
            author: 'capture-funnel',
          },
        ]
      : [],
    timeline: [
      {
        id: crypto.randomUUID(),
        label: `Lead captured from ${normalized.source}`,
        timestamp: createdAt,
      },
    ],
  };

  const matchedBuyer = assignBuyer(lead, store.buyers, store.leads);

  if (matchedBuyer) {
    lead.buyerId = matchedBuyer.id;
    lead.pricePerLead = matchedBuyer.pricePerLead;
    lead.timeline.unshift({
      id: crypto.randomUUID(),
      label: `Matched to ${matchedBuyer.name}`,
      timestamp: createdAt,
    });
  }

  const outreach = buildOutreachTasks(lead, matchedBuyer, store.playbooks);
  return { lead, outreach };
}

export function updateLeadStatus(store, leadId, status) {
  if (!status) {
    throw new Error('Status is required');
  }

  const lead = store.leads.find((entry) => entry.id === leadId);
  if (!lead) {
    throw new Error(`Lead ${leadId} not found`);
  }

  const timestamp = new Date().toISOString();
  lead.status = status;
  lead.updatedAt = timestamp;
  lead.timeline.unshift({
    id: crypto.randomUUID(),
    label: `Status updated to ${status}`,
    timestamp,
  });

  return lead;
}

export function addLeadNote(store, leadId, note) {
  if (!note || !note.trim()) {
    throw new Error('Note is required');
  }

  const lead = store.leads.find((entry) => entry.id === leadId);
  if (!lead) {
    throw new Error(`Lead ${leadId} not found`);
  }

  const timestamp = new Date().toISOString();
  lead.notes.unshift({
    id: crypto.randomUUID(),
    text: note.trim(),
    createdAt: timestamp,
    author: 'operator',
  });
  lead.updatedAt = timestamp;

  return lead;
}

export function dispatchOutreachBatch(store, limit = 5) {
  const now = Date.now();
  const queued = store.outreach
    .filter((task) => task.status === 'queued')
    .sort((left, right) => new Date(left.scheduledFor).getTime() - new Date(right.scheduledFor).getTime());

  const ready = queued.filter((task) => new Date(task.scheduledFor).getTime() <= now);
  const batch = [...ready, ...queued.filter((task) => !ready.includes(task))].slice(0, Math.max(limit, 1));

  for (const task of batch) {
    task.status = task.audience === 'buyer' && !task.buyerId ? 'blocked' : 'sent';
    task.sentAt = new Date().toISOString();
    task.lastResult = task.status === 'sent' ? 'queued-playbook-dispatched' : 'missing-buyer';

    const lead = store.leads.find((entry) => entry.id === task.leadId);
    if (!lead) {
      continue;
    }

    lead.updatedAt = task.sentAt;
    if (task.audience === 'buyer' && task.status === 'sent') {
      lead.status = lead.status === 'sold' ? 'sold' : 'routed';
    }

    lead.timeline.unshift({
      id: crypto.randomUUID(),
      label: `${task.channel.toUpperCase()} task sent to ${task.audience}`,
      timestamp: task.sentAt,
    });
  }

  return {
    ok: true,
    dispatched: batch.filter((task) => task.status === 'sent').length,
    blocked: batch.filter((task) => task.status === 'blocked').length,
    tasks: batch,
  };
}

export function exportLeadsCsv(store) {
  const lines = [
    [
      'lead_id',
      'created_at',
      'name',
      'service_type',
      'city',
      'source',
      'score',
      'grade',
      'status',
      'buyer_id',
      'price_per_lead',
      'phone',
      'email',
    ].join(','),
  ];

  for (const lead of store.leads) {
    lines.push(
      [
        lead.id,
        lead.createdAt,
        csvEscape(lead.name),
        csvEscape(serviceCatalog[lead.serviceType]?.label || lead.serviceType),
        csvEscape(lead.city),
        csvEscape(lead.source),
        lead.score,
        lead.grade,
        lead.status,
        lead.buyerId || '',
        lead.pricePerLead || 0,
        csvEscape(lead.phone),
        csvEscape(lead.email),
      ].join(','),
    );
  }

  return `${lines.join('\n')}\n`;
}

export function buildDashboardPayload(store, baseUrl) {
  const leads = [...store.leads].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const outreach = [...store.outreach].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  const totals = {
    totalLeads: leads.length,
    qualifiedLeads: leads.filter((lead) => lead.status === 'qualified').length,
    routedLeads: leads.filter((lead) => lead.status === 'routed').length,
    soldLeads: leads.filter((lead) => lead.status === 'sold').length,
    reviewLeads: leads.filter((lead) => lead.status === 'review').length,
    avgScore: Math.round(leads.reduce((sum, lead) => sum + Number(lead.score || 0), 0) / Math.max(leads.length, 1)),
    pipelineValue: leads
      .filter((lead) => ['qualified', 'routed', 'sold'].includes(lead.status))
      .reduce((sum, lead) => sum + Number(lead.pricePerLead || 0), 0),
    activeOutreach: outreach.filter((task) => task.status === 'queued').length,
  };

  const sourceMix = tallyBy(leads, 'source');
  const cityMix = tallyBy(leads, 'city');
  const serviceMix = leads.reduce((accumulator, lead) => {
    const serviceKey = lead.serviceType;
    const existing = accumulator[serviceKey] || {
      key: serviceKey,
      label: serviceCatalog[serviceKey]?.label || serviceKey,
      count: 0,
    };

    existing.count += 1;
    accumulator[serviceKey] = existing;
    return accumulator;
  }, {});

  const buyerLoadMap = store.leads.reduce((accumulator, lead) => {
    if (!lead.buyerId || !['qualified', 'routed', 'sold'].includes(lead.status)) {
      return accumulator;
    }

    accumulator[lead.buyerId] = (accumulator[lead.buyerId] || 0) + 1;
    return accumulator;
  }, {});

  const buyers = store.buyers.map((buyer) => ({
    ...buyer,
    currentLoad: buyerLoadMap[buyer.id] || 0,
    openCapacity: Math.max(buyer.monthlyDemand - (buyerLoadMap[buyer.id] || 0), 0),
    serviceLabels: buyer.serviceTypes.map((serviceType) => serviceCatalog[serviceType]?.label || serviceType),
  }));

  return {
    product: {
      name: 'SignalStack',
      tagline: 'Lead generation and routing for local service operators.',
      captureUrl: `${baseUrl}/capture`,
      exportUrl: `${baseUrl}/api/export/leads.csv`,
    },
    metrics: {
      ...totals,
      sourceMix,
      cityMix,
      serviceMix: Object.values(serviceMix).sort((left, right) => right.count - left.count),
      stageCounts: statusSort.map((status) => ({
        status,
        count: leads.filter((lead) => lead.status === status).length,
      })),
      hotLeads: leads.filter((lead) => lead.score >= 80).slice(0, 5),
    },
    leads: leads.map((lead) => ({
      ...lead,
      serviceLabel: serviceCatalog[lead.serviceType]?.label || lead.serviceType,
      buyerName: store.buyers.find((buyer) => buyer.id === lead.buyerId)?.name || 'Unassigned',
    })),
    outreach,
    buyers,
    campaigns: store.campaigns,
    playbooks: store.playbooks,
  };
}

export function normalizeLeadPayload(payload = {}) {
  const serviceType = normalizeServiceType(payload.serviceType);
  const name = titleCase(payload.name || `${payload.firstName || ''} ${payload.lastName || ''}`.trim());
  const city = titleCase(payload.city || payload.serviceArea || 'Unknown');
  const source = String(payload.source || payload.utmSource || 'Website Form').trim();
  const campaign = String(payload.campaign || payload.utmCampaign || 'always-on').trim();
  const budgetBand = String(payload.budgetBand || 'mid').trim().toLowerCase();
  const urgency = String(payload.urgency || 'this-week').trim().toLowerCase();
  const propertyType = String(payload.propertyType || 'homeowner').trim().toLowerCase();
  const message = String(payload.message || '').trim();

  return {
    name,
    email: String(payload.email || '').trim().toLowerCase(),
    phone: normalizePhone(payload.phone),
    city,
    zip: String(payload.zip || '').trim(),
    serviceType,
    source,
    campaign,
    urgency,
    budgetBand,
    propertyType,
    contactPreference: String(payload.contactPreference || 'sms').trim().toLowerCase(),
    consentGiven: Boolean(payload.consentGiven),
    message,
  };
}

export function scoreLead(lead, buyers) {
  const reasons = [];
  let score = 24;

  const serviceDetails = serviceCatalog[lead.serviceType];
  score += serviceDetails?.score || 7;
  if (serviceDetails) {
    reasons.push(`${serviceDetails.label} is a high-intent local service request.`);
  }

  if (lead.consentGiven) {
    score += 15;
    reasons.push('Consent captured for compliant outreach.');
  } else {
    score -= 12;
    reasons.push('Missing consent keeps the lead in review.');
  }

  if (lead.phone) {
    score += 10;
    reasons.push('Phone number present for rapid follow-up.');
  }

  if (lead.email) {
    score += 4;
  }

  score += urgencyWeights[lead.urgency] || 4;
  score += budgetWeights[lead.budgetBand] || budgetWeights.unknown;
  score += propertyWeights[lead.propertyType] || propertyWeights.unknown;

  if (lead.message.length >= 20) {
    score += 4;
    reasons.push('Lead included useful qualification detail.');
  }

  const sourceWeight = sourceWeights[toKey(lead.source)] || 7;
  score += sourceWeight;
  reasons.push(`${lead.source} is configured as an active acquisition source.`);

  const marketMatch = buyers.some(
    (buyer) => buyer.active && buyer.serviceTypes.includes(lead.serviceType) && matchesCity(buyer.territories, lead.city),
  );

  if (marketMatch) {
    score += 12;
    reasons.push(`Buyer capacity exists in ${lead.city}.`);
  }

  const finalScore = clamp(Math.round(score), 18, 99);
  return {
    score: finalScore,
    grade: gradeScore(finalScore),
    reasons,
  };
}

export function assignBuyer(lead, buyers, existingLeads = []) {
  if (!lead.consentGiven) {
    return null;
  }

  const rankedBuyers = buyers
    .filter((buyer) => buyer.active && buyer.serviceTypes.includes(lead.serviceType))
    .map((buyer) => {
      const currentLoad = existingLeads.filter(
        (entry) => entry.buyerId === buyer.id && ['qualified', 'routed', 'sold'].includes(entry.status),
      ).length;

      let fit = 0;
      fit += matchesCity(buyer.territories, lead.city) ? 35 : 8;
      fit += Math.max(18 - Math.abs((lead.score || 0) - buyer.qualityFloor), 0);
      fit += Math.max(buyer.pricePerLead - 20, 0);
      fit += Math.max(buyer.monthlyDemand - currentLoad, 0);

      return {
        buyer,
        fit,
      };
    })
    .filter(({ buyer }) => (lead.score || 0) >= buyer.qualityFloor - 12)
    .sort((left, right) => right.fit - left.fit);

  return rankedBuyers[0]?.buyer || null;
}

function buildOutreachTasks(lead, buyer, playbooks = []) {
  const playbook = selectPlaybook(lead.serviceType, playbooks);
  if (!playbook || !lead.consentGiven) {
    return [];
  }

  const createdAt = new Date().toISOString();

  return playbook.steps.map((step) => {
    const scheduledFor = new Date(Date.now() + step.delayMinutes * 60_000).toISOString();
    const buyerRecord = step.audience === 'buyer' ? buyer : null;

    return {
      id: crypto.randomUUID(),
      createdAt,
      scheduledFor,
      leadId: lead.id,
      buyerId: buyerRecord?.id || null,
      playbookId: playbook.id,
      audience: step.audience,
      channel: step.channel,
      status: step.audience === 'buyer' && !buyerRecord ? 'blocked' : 'queued',
      subject: renderTemplate(step.subject || `${lead.name} lead`, lead, buyerRecord),
      message: renderTemplate(step.message, lead, buyerRecord),
      lastResult: null,
    };
  });
}

function selectPlaybook(serviceType, playbooks) {
  return (
    playbooks.find((playbook) => playbook.serviceTypes.includes(serviceType)) ||
    playbooks.find((playbook) => playbook.serviceTypes.includes('default')) ||
    null
  );
}

function renderTemplate(template, lead, buyer) {
  return template
    .replaceAll('{leadName}', lead.name)
    .replaceAll('{serviceLabel}', serviceCatalog[lead.serviceType]?.label || lead.serviceType)
    .replaceAll('{city}', lead.city)
    .replaceAll('{phone}', lead.phone || 'n/a')
    .replaceAll('{email}', lead.email || 'n/a')
    .replaceAll('{budgetBand}', lead.budgetBand)
    .replaceAll('{urgency}', lead.urgency)
    .replaceAll('{buyerName}', buyer?.name || 'buyer pending');
}

function normalizeServiceType(serviceType) {
  const key = String(serviceType || '').trim().toLowerCase();

  if (serviceCatalog[key]) {
    return key;
  }

  if (key.includes('lawn')) {
    return 'lawn-care';
  }

  if (key.includes('wash')) {
    return 'pressure-washing';
  }

  if (key.includes('window')) {
    return 'window-cleaning';
  }

  return 'detailing';
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return String(phone || '').trim();
}

function gradeScore(score) {
  if (score >= 90) {
    return 'A+';
  }

  if (score >= 80) {
    return 'A';
  }

  if (score >= 70) {
    return 'B';
  }

  if (score >= 60) {
    return 'C';
  }

  return 'D';
}

function tallyBy(items, key) {
  const tallies = items.reduce((accumulator, item) => {
    const label = item[key] || 'Unknown';
    accumulator[label] = (accumulator[label] || 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(tallies)
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 6);
}

function matchesCity(territories, city) {
  return territories.some((territory) => territory.toLowerCase() === city.toLowerCase());
}

function titleCase(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toKey(value) {
  return String(value || '').trim().toLowerCase();
}

function csvEscape(value) {
  const text = String(value || '');
  return `"${text.replaceAll('"', '""')}"`;
}
