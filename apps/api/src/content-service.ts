import { Prisma } from '@prisma/client';
import { ContentPackage, validatePackage } from '@langplot/shared';
import { db } from './db.js';
import { ApiError } from './errors.js';
export async function importPackage(input: unknown) {
  const report=validatePackage(input);
  if(!report.valid)throw new ApiError(400,'INVALID_PACKAGE',report.errors.join('\n'));
  const content=ContentPackage.parse(input);
  if(content.manifest.status!=='draft')throw new ApiError(400,'DRAFT_REQUIRED','Импорт принимает только черновики. Публикация пока не подключена.');
  try{
    const version=await db.contentVersion.create({data:{packageId:content.manifest.id,version:content.manifest.version,language:content.manifest.language,level:content.manifest.level,status:'draft',data:content as unknown as Prisma.InputJsonValue}});
    return {id:version.id,report};
  }catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ApiError(409,'VERSION_EXISTS','Эта версия пакета уже существует. Увеличьте manifest.version.');throw error;}
}
