export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string) {
  return process.env[name] || "";
}

export function missingEnv(names: string[]) {
  return names.filter((name) => !process.env[name]);
}
