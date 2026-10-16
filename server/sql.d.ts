// Fișierele .sql sunt incluse ca text la build (esbuild --loader:.sql=text).
declare module '*.sql' {
  const sql: string;
  export default sql;
}
