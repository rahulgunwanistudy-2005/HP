// Optional providers return drafts only. No provider is invoked by the default no-key workflow.
export interface DraftProvider {readonly name:string; extractDraft(input:{text:string,url:string}):Promise<{claims:string[],warnings:string[]}>;}
export class NoKeyProvider implements DraftProvider {
  readonly name='none';
  async extractDraft(_input:{text:string,url:string}){return{claims:[],warnings:['No AI provider configured. Deterministic extraction produces source passages for analyst review only.']};}
}
export function provider():DraftProvider {return new NoKeyProvider();}
