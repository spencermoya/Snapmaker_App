declare module 'meross-local' {
  export class MerossSmartPlug {
    constructor(address: string, key: string);
    turnOn(channel?: number): Promise<unknown>;
    turnOff(channel?: number): Promise<unknown>;
    getState(): Promise<unknown>;
    getPower(channel?: number): Promise<boolean>;
  }
}
