declare module 'json-bigint' {
  interface JSONbig {
    parse(text: string): any;
    stringify(value: any): string;
  }

  function JSONbig(options?: { storeAsString?: boolean }): JSONbig;
  export = JSONbig;
}
