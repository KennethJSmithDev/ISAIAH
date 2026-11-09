import { ChatGPTAccount } from './account.mjs';
const dir=process.env.ISAIAH_CHATGPT_ACCOUNT_DIR;
if(!dir)throw new Error('Set ISAIAH_CHATGPT_ACCOUNT_DIR to the protected ISAIAH account directory.');
const account=new ChatGPTAccount(dir);await account.init();
try {
  const command=process.argv[2]??'status';
  if(command==='login') {console.log('Opening the browser for ChatGPT sign-in and plan-use consent.');console.log(JSON.stringify(await account.login()));}
  else if(command==='status')console.log(JSON.stringify(account.status()));
  else if(command==='disconnect')console.log(JSON.stringify(await account.disconnect()));
  else if(command==='models') {
    const token=await account.accessToken();const res=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw new Error('Could not load the account model catalog.');
    const data=await res.json();console.log(JSON.stringify(data.models.filter(m=>m.visibility==='list').map(m=>({id:m.slug,name:m.display_name}))));
  } else throw new Error('Use login, status, models, or disconnect.');
} catch(e) {console.error(e.message);process.exitCode=1;}
finally {await account.close();}
