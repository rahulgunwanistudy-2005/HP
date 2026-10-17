import {presentation} from '../server/workspace.ts';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Store} from '../server/db.ts';
import {Repository,seed} from '../server/repository.ts';
import {brief,printBrief} from '../server/exports.ts';
const db=new Store();seed(db);const repo=new Repository(db);mkdirSync('deliverables/briefs',{recursive:true});for(const a of repo.accounts()){writeFileSync(`deliverables/briefs/${a.id}.md`,brief(a,repo.territory(),presentation));writeFileSync(`deliverables/briefs/${a.id}.html`,printBrief(a,repo.territory(),presentation));}console.log(`Exported ${repo.accounts().length} evidence-linked Markdown and print briefs.`);db.close();
