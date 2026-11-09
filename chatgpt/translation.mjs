// The native AI Hub gateway speaks Chat Completions; ChatGPT plan usage speaks Responses.
// Only the text and function-call shapes used by the scoped investigation are accepted.
export function toResponses(chat, prior = new Map()) {
  if (!chat || typeof chat.model !== 'string' || !Array.isArray(chat.messages) || chat.stream === true) throw new Error('Unsupported completion request.');
  const tools = (chat.tools ?? []).map(tool => {
    const f = tool?.function;
    if (tool.type !== 'function' || !f || !/^[A-Za-z0-9_-]{1,128}$/.test(f.name)) throw new Error('Unsupported tool.');
    return { type:'function', name:f.name, description:f.description ?? '', parameters:f.parameters ?? {type:'object',properties:{}}, strict:false };
  });
  const names = new Set(tools.map(t => t.name));
  if (names.size !== tools.length) throw new Error('Duplicate tool name.');
  const input = [];
  for (const m of chat.messages) {
    if (['system','developer','user'].includes(m.role)) {
      if (typeof m.content !== 'string') throw new Error('Only text messages are supported.');
      input.push({role:m.role === 'system' ? 'developer' : m.role,content:m.content});
    } else if (m.role === 'assistant') {
      if (m.tool_calls?.length) {
        const ids=m.tool_calls.map(call=>call.id);
        const saved=prior.get(ids.join('\u0000'));
        if (!saved) throw new Error('Tool continuation does not match this active response.');
        const original=saved.filter(item=>item.type==='function_call');
        if(original.length!==m.tool_calls.length || original.some((item,i)=>item.call_id!==m.tool_calls[i].id || item.name!==m.tool_calls[i].function?.name || item.arguments!==m.tool_calls[i].function?.arguments)) throw new Error('Tool continuation does not match this active response.');
        input.push(...saved);
      } else if (typeof m.content === 'string') input.push({role:'assistant',content:m.content});
      else throw new Error('Unsupported assistant message.');
    } else if (m.role === 'tool' && typeof m.tool_call_id === 'string' && typeof m.content === 'string') {
      input.push({type:'function_call_output',call_id:m.tool_call_id,output:m.content});
    } else throw new Error('Unsupported message role.');
  }
  const request={model:chat.model,input,store:false,stream:true};
  if (tools.length) request.tools=[{type:'namespace',name:'isaiah',description:'Read-only tools scoped to the active ISAIAH investigation.',tools}];
  if (chat.tool_choice === 'none' || chat.tool_choice === 'auto' || chat.tool_choice === 'required') request.tool_choice=chat.tool_choice;
  else if (chat.tool_choice != null) throw new Error('Unsupported tool choice.');
  return request;
}

export function fromResponses(response, originalTools = [], prior = new Map()) {
  if (!response || response.status !== 'completed' || !Array.isArray(response.output)) throw new Error('Response did not complete.');
  const allowed=new Set(originalTools.map(t=>t.function?.name));
  const calls=[], text=[];
  for (const item of response.output) {
    if (item.type === 'function_call') {
      if (item.namespace !== 'isaiah' || !allowed.has(item.name) || typeof item.call_id !== 'string' || typeof item.arguments !== 'string') throw new Error('Unexpected function call.');
      calls.push({id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments}});
    } else if (item.type === 'message') {
      for (const part of item.content ?? []) {
        if (part.type === 'output_text' && typeof part.text === 'string') text.push(part.text);
        else if (part.type === 'refusal') throw new Error('Model refused the request.');
      }
    } else if (item.type !== 'reasoning') throw new Error('Unexpected response item.');
  }
  if (!calls.length && !text.length) throw new Error('Empty response.');
  if (calls.length) prior.set(calls.map(c=>c.id).join('\u0000'),response.output);
  const prompt=response.usage?.input_tokens ?? 0, completion=response.usage?.output_tokens ?? 0;
  return {id:response.id,object:'chat.completion',model:response.model,choices:[{index:0,message:{role:'assistant',content:text.join('') || null,...(calls.length?{tool_calls:calls}:{})},finish_reason:calls.length?'tool_calls':'stop'}],usage:{prompt_tokens:prompt,completion_tokens:completion,total_tokens:response.usage?.total_tokens ?? prompt+completion}};
}

export async function completedEvent(body, maximum = 2_000_000) {
  if (!body) throw new Error('Missing response stream.');
  const decoder=new TextDecoder(), chunks=[]; let bytes=0;
  for await (const part of body) { bytes+=part.byteLength; if(bytes>maximum) throw new Error('Response stream too large.'); chunks.push(decoder.decode(part,{stream:true})); }
  chunks.push(decoder.decode());
  let completed;
  for (const block of chunks.join('').split(/\r?\n\r?\n/)) {
    const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') continue;
    let event; try { event=JSON.parse(data); } catch { throw new Error('Malformed response event.'); }
    if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') throw new Error('Response failed or was incomplete.');
    if (event.type === 'response.completed') { if(completed) throw new Error('Duplicate terminal event.'); completed=event.response; }
  }
  if (!completed) throw new Error('Stream ended before response.completed.');
  return completed;
}
