import JSONbigIntFactory from 'json-bigint';

const JSONbigString = JSONbigIntFactory({ storeAsString: true });

export function JSONbigIntParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return JSONbigString.parse(text);
  }
}
