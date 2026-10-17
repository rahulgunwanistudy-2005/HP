import {defineConfig,loadEnv} from 'vite';
export default defineConfig(({mode})=>{
  const env={...loadEnv(mode,process.cwd(),''),...process.env},configuredHost=env.HOST?.trim().toLowerCase()||'127.0.0.1',host=configuredHost==='0.0.0.0'?'127.0.0.1':configuredHost==='::'?'::1':configuredHost,port=env.PORT?.trim()??'3001';
  if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error('PORT must be an integer from 1 to 65535 for the API proxy.');
  const authority=host.includes(':')?`[${host}]`:host;
  const target=new URL(`http://${authority}:${Number(port)}`);if(target.hostname.replace(/^\[|\]$/g,'')!==host||target.pathname!=='/'||target.username||target.password)throw new Error('HOST must be a hostname or IP address without a scheme, path or port.');
  return{server:{port:5173,strictPort:true,proxy:{'/api':target.origin}},build:{outDir:'dist'}};
});
