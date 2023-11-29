import { JSONArray, JSONObject, JSONPrimitive, JSONValue } from "./json-types";

export type Permission = "r" | "w" | "rw" | "none";

export type StoreResult = Store | JSONPrimitive | undefined;

export type StoreValue =
  | JSONObject
  | JSONArray
  | StoreResult
  | (() => StoreResult);

type KeyofStore = keyof Store;

type Restrictions = { [K in KeyofStore | string]: Permission[] };

type Decorateur = (target: Store, context: string) => void;

export interface IStore {
  defaultPolicy: Permission;
  allowedToRead(key: string): boolean;
  allowedToWrite(key: string): boolean;
  read(path: string): StoreResult;
  write(path: string, value: StoreValue): StoreValue;
  writeEntries(entries: JSONObject): void;
  entries(): JSONObject;
}

export function Restrict(...params: Permission[]): Decorateur {
  return function(store, memberName): void {
    store.restrictions = { ...(store.restrictions || {}), [memberName]: params };
  };
}

export class Store implements IStore {
  public defaultPolicy: Permission = "rw";
  public restrictions?: Restrictions;

  public constructor(data?: any) { if (data) this.writeEntries(data); }

  public allowedToRead(key: string): boolean { return this.checkPermission(key, "r"); }

  public allowedToWrite(key: string): boolean { return this.checkPermission(key, "w"); }

  public read(path: string): StoreResult {
    if (!path) return;
    const [key, ...subPath] = path.split(":");
    if (!this.allowedToRead(key)) throw new Error;
    const currentValue = this[key as KeyofStore] as StoreValue;
    if (currentValue instanceof Store && !currentValue.allowedToRead(key)) throw new Error;
    if (subPath.length && typeof currentValue === "function") return (currentValue as Function)().read((subPath.join(":")));
    if (typeof currentValue === "string") return currentValue as JSONPrimitive;
    if (typeof currentValue === "function") return currentValue();
    return this.getValueFromPath(subPath, currentValue as JSONObject);
  }

  public write(path: string, value: StoreValue): StoreValue {
    if (!path) return;
    const [key, ...subPath] = path.split(":");
    const currentValue = this[key as KeyofStore] as StoreValue;
    if (subPath.length) {
      if (currentValue instanceof Store) {
        if (!currentValue.allowedToWrite(key)) throw new Error;
        const output = this.createNestedObject([key, ...subPath], value);
        return Object.assign(this, output);
      }
    }
    if (!this.allowedToWrite(key)) throw new Error;
    const output = this.createNestedObject(path.split(":"), value);
    return Object.assign(this, output);
  }

  public writeEntries(entries: JSONObject): void {
    if (typeof entries !== "object") return;
    return Object.entries(entries).forEach(([key, value]) => this.write(key, value));
  }

  public entries(): JSONObject {
    return Object.entries(this).reduce<JSONObject>((acc, [key, value]) => {
      if (key === "defaultPolicy" || !this.allowedToRead(key)) return acc;
      acc[key] = value;
      return acc;
    }, {});
  }

  private createNestedObject(path: string[], value: StoreValue): JSONObject {
    const [current, ...rest] = path;
    if (!rest.length) return { [path[0]]: value as JSONValue };
    return {[current]: this.createNestedObject(rest, value)};
  }

  private getValueFromPath(path: string[], currentValue: JSONObject): StoreResult {
    const [current, ...rest] = path;
    if (!rest.length) return currentValue[path[0]] as StoreResult;
    return this.getValueFromPath(rest, currentValue[current] as JSONObject);
  }

  public checkPermission(key: string, action: "r" | "w"): boolean {
    const permission = this.restrictions?.[key] ?? this.defaultPolicy;
    return permission.includes(action) || permission.includes("rw");
  }
}
