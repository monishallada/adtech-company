const form = document.querySelector('#capture-form');
const statusNode = document.querySelector('#capture-status');
const params = new URLSearchParams(window.location.search);

if (params.get('service')) {
  form.serviceType.value = params.get('service');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.consentGiven = formData.get('consentGiven') === 'on';
  payload.source = params.get('source') || 'Landing Page';
  payload.campaign = params.get('campaign') || 'always-on';

  const response = await fetch('/api/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok) {
    statusNode.textContent = result.error || 'Something went wrong.';
    return;
  }

  statusNode.textContent = `Request submitted. Reference: ${result.lead.id}`;
  form.reset();
});
