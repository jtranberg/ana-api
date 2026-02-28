import { create } from "xmlbuilder2";

export function xmlToString(doc: any): string {
  return doc.end({ prettyPrint: true });
}

export function createXmlRoot(rootName: string) {
  return create({ version: "1.0", encoding: "UTF-8" }).ele(rootName);
}
