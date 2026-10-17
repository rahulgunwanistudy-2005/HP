import {PDFParse} from 'pdf-parse';
const MAX_BYTES=5*1024*1024,MAX_PAGES=60;
const chunks=[];let size=0;
for await(const chunk of process.stdin){size+=chunk.length;if(size>MAX_BYTES)throw new Error('PDF exceeds 5 MiB input limit');chunks.push(Buffer.from(chunk));}
const parser=new PDFParse({data:new Uint8Array(Buffer.concat(chunks))});
try{
  const metadata=await parser.getInfo();
  const result=await parser.getText({first:MAX_PAGES});
  const pages=result.pages.map(page=>({page:page.num,text:page.text.slice(0,20000)}));
  const dates=metadata.getDateNode();
  const title=typeof metadata.info?.Title==='string'&&metadata.info.Title.trim()?metadata.info.Title.trim().slice(0,1000):'Public PDF document';
  // PDF creation/modification dates are retained as technical metadata, never publication/event dates.
  process.stdout.write(JSON.stringify({title,text:result.text.slice(0,500000),items:pages,pages,pageCount:result.total,publishedAt:null,sourceMetadata:{pdfAuthor:typeof metadata.info?.Author==='string'?metadata.info.Author:null,pdfCreatedAt:dates.CreationDate?.toISOString()??null,pdfModifiedAt:dates.ModDate?.toISOString()??null,metadataBasis:'PDF technical metadata; not a publication or business event date'},warnings:[...(result.total>MAX_PAGES?['PDF extraction limited to first '+MAX_PAGES+' of '+result.total+' pages']:[]),...(result.text.length>500000?['Extracted PDF text truncated at 500,000 characters']:[])]}));
}finally{await parser.destroy();}
