/** Same-origin relay: authentication stays on Render; no access key is embedded in Vercel. */
export default {
 async fetch(request:Request){
  const incoming = new URL(request.url);
  // Vercel's rewrite passes the complete API route to this single function.
  if (incoming.pathname === '/api/proxy') {
   const routes = incoming.searchParams.getAll('__hp_route');
   if (routes.length !== 1 || !routes[0]) return new Response('Not found', {status:404});
   incoming.pathname = '/api/' + routes[0];
   incoming.searchParams.delete('__hp_route');
  }
  if (!incoming.pathname.startsWith('/api/') || incoming.pathname === '/api/proxy') {
   return new Response('Not found', {status:404});
  }
  const origin=process.env.RENDER_API_URL;
  if(!origin)return Response.json({error:{code:'BACKEND_UNAVAILABLE',message:'The workspace service has not been configured.'}},{status:503,headers:{'Cache-Control':'no-store'}});
  let backend:URL;try{backend=new URL(origin);if(backend.protocol!=='https:'||backend.username||backend.password||backend.pathname!=='/'||backend.search||backend.hash)throw Error('Invalid service origin');}catch{return Response.json({error:{code:'BACKEND_UNAVAILABLE',message:'The workspace service configuration is invalid.'}},{status:503});}
  const headers=new Headers();for(const name of['accept','content-type','cookie','authorization','origin']){const value=request.headers.get(name);if(value)headers.set(name,value);}
  try{
   const response=await fetch(new URL(incoming.pathname+incoming.search,backend),{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer(),redirect:'manual',signal:AbortSignal.timeout(55000)});
   const output=new Headers(response.headers);output.delete('content-encoding');output.delete('content-length');output.delete('transfer-encoding');output.set('Cache-Control','no-store');
   return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers:output});
  }catch{return Response.json({error:{code:'BACKEND_UNAVAILABLE',message:'The workspace service is temporarily unavailable. Please try again.'}},{status:503,headers:{'Cache-Control':'no-store'}});}
 }
};
