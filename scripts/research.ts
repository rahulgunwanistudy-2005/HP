export {};
const [accountId,...urls]=process.argv.slice(2);
if(!accountId){console.error('Usage: npm run research -- <account-id> [public-url ...] (server must be running)');process.exit(1);}
const headers:Record<string,string>={'Content-Type':'application/json'};if(process.env.API_TOKEN)headers.Authorization=`Bearer ${process.env.API_TOKEN}`;
const response=await fetch(`http://127.0.0.1:${process.env.PORT??3001}/api/research-runs`,{method:'POST',headers,body:JSON.stringify({accountId,...(urls.length?{urls}:{})})});console.log(JSON.stringify(await response.json(),null,2));if(!response.ok)process.exitCode=1;
