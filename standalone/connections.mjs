import { legacyModel, loadProviderProfile, validateProviderProfile } from '../provider-profiles.mjs';

// Presets configure the existing AI Hub gateway. They neither sign in nor move credentials.
export async function connectionPreset(choice, { model, port, compose = false, accountName, accountOrigin } = {}) {
  if (!['ollama','compatible','chatgpt'].includes(choice)) throw new Error('Choose ollama, compatible, or chatgpt.');
  if ((accountName || accountOrigin) && choice !== 'compatible') throw new Error('External account sockets use a compatible bridge; qualified presets remain unchanged.');
  const selectedPort = String(port ?? ({ollama:18758,compatible:1234,chatgpt:18759})[choice]);
  if (!/^[0-9]{4,5}$/.test(selectedPort) || +selectedPort < 1024 || +selectedPort > 65535) throw new Error('Choose an unprivileged local port.');
  if (choice === 'ollama') {
    const original=await loadProviderProfile({standalone:true,compose});
    if (model && model !== legacyModel) throw new Error('The Ollama preset preserves the pinned model. Use an explicit independently qualified profile for other weights.');
    const {id,kind,version,digest}=original;
    return {id,kind,model:legacyModel,origin:`http://${compose?'host.docker.internal':'127.0.0.1'}:${selectedPort}`,version,digest};
  }
  if (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) throw new Error('Select an exact model ID from your endpoint or account catalog.');
  return validateProviderProfile({id:choice==='chatgpt'?'chatgpt-plan':'local-compatible',kind:'openai-compatible',
    origin:`http://${compose?'host.docker.internal':'127.0.0.1'}:${selectedPort}`,model,
    ...(accountName || accountOrigin ? {account:{protocol:'local-account-bridge.v1',name:accountName,managementOrigin:accountOrigin}} : {})}, {compose});
}
