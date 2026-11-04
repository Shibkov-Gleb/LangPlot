import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileStorage } from '@langplot/agents';
import { ResourcePath } from '@langplot/shared';
export class LocalFileStorage implements FileStorage {
  readonly status='ready';
  constructor(private readonly root:string){}
  private resolve(key:string){ResourcePath.parse(key);const root=path.resolve(this.root);const target=path.resolve(root,key);if(!target.startsWith(root+path.sep))throw new Error('INVALID_RESOURCE_PATH');return target;}
  async put(key:string,bytes:Uint8Array){if(bytes.byteLength>10*1024*1024)throw new Error('RESOURCE_TOO_LARGE');const target=this.resolve(key);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});}
  async read(key:string){return readFile(this.resolve(key));}
}
