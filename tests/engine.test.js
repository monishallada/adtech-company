import test from 'node:test';
import assert from 'node:assert/strict';

import { assignBuyer, createLeadRecord, scoreLead } from '../src/engine.js';
import seed from '../data/seed.json' with { type: 'json' };

test('scoreLead rewards consent and market match', () => {
  const result = scoreLead(
    {
      name: 'Test Lead',
      email: 'lead@example.com',
      phone: '813-555-0100',
      city: 'Tampa',
      serviceType: 'detailing',
      source: 'Meta Lead Ads',
      urgency: 'today',
      budgetBand: 'premium',
      propertyType: 'homeowner',
      consentGiven: true,
      message: 'Need a full detail today for a family SUV.',
    },
    seed.buyers,
  );

  assert.ok(result.score >= 85);
  assert.equal(result.grade, 'A+');
});

test('assignBuyer picks the matching territory and vertical', () => {
  const buyer = assignBuyer(
    {
      city: 'Brandon',
      serviceType: 'lawn-care',
      score: 84,
      consentGiven: true,
    },
    seed.buyers,
    seed.leads,
  );

  assert.equal(buyer?.id, 'buyer-greenline');
});

test('createLeadRecord creates outreach tasks for compliant leads', () => {
  const { lead, outreach } = createLeadRecord(
    {
      name: 'Jordan Mendez',
      email: 'jordan@example.com',
      phone: '813-555-0141',
      city: 'Tampa',
      serviceType: 'detailing',
      source: 'Website Form',
      campaign: 'always-on',
      urgency: 'this-week',
      budgetBand: 'mid',
      propertyType: 'homeowner',
      consentGiven: true,
      message: 'Need interior stain removal before selling the car.',
    },
    seed,
  );

  assert.equal(lead.buyerId, 'buyer-shinecraft');
  assert.ok(outreach.length >= 2);
  assert.ok(outreach.every((task) => task.status === 'queued' || task.status === 'blocked'));
});
