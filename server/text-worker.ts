import {parseFeed,parseHtml,parseJson,MAX_BYTES} from './retrieval.ts';
const chunks:Buffer[]=[];let size=0;
for await(const chunk of process.stdin){size+=chunk.length;if(size>2*MAX_BYTES+65536)throw new Error('Text parser input exceeds limit');chunks.push(Buffer.from(chunk));}
const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
if(typeof input.text!=='string'||!['html','json','feed'].includes(input.adapter))throw new Error('Unsupported parser input');
if(Buffer.byteLength(input.text)>MAX_BYTES)throw new Error('Document exceeds input limit');
const parsed=input.adapter==='json'?parseJson(input.text):input.adapter==='feed'?parseFeed(input.text):parseHtml(input.text);
process.stdout.write(JSON.stringify(parsed));
