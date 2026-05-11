import { Client } from "adb-ts"
import Logger from "electron-log"
import * as frida from "frida"

export const adb = new Client({})

export const getUrl = (version:string, arch:string) => `https://github.com/frida/frida/releases/download/${version}/${fileName(version, arch)}.xz`
export const fileNameFB = (version:string, arch:string) => `frida-server-${version}-freebsd-${arch}`
export const fileName = (version:string, arch:string) => `frida-server-${version}-android-${arch}`
export const getArch = async (id:string):Promise<string> => {
    if(id === '') {
        Logger.error('[*] ADB not connected')
        return ''
    }
    const os = await adb.shell(id, 'getprop ro.product.cpu.abi')
    let arch = 'arm'
    if (os.includes('x86')) {
        arch = 'x86'
    }
    const bits = await adb.shell(id, 'getprop ro.product.cpu.abilist')
    if (bits.includes('64')) {
        if(arch === 'x86') arch = 'x86_64'
        else arch = 'arm64'
    }
    return arch
}

export const startFrida = async (id:string, filename:string, onCrashed:() => void):Promise<boolean> => {
    if(id === '') {
        Logger.error('[*] ADB not connected');
        return false;
    }
    try{
        const server = adb.shell(id, `su -c /data/local/tmp/${filename}`)
        server.then(onCrashed)
        return true
    } catch (err) {
        Logger.error(`[*] Failed to start frida server`)
        return false
    }
}

// Backward compatibility export (to be removed after refactor)
export const connectFrida = async (serial:string, onCrashed:() => void, onConnected:(d:frida.Device) => void) => {
    const devc = await frida.getDevice(serial);
    if(devc) {
        devc.processCrashed.connect(onCrashed);
        onConnected(devc)
        return;
    }
    const deviceManager = frida.getDeviceManager();
    const ds = await deviceManager.enumerateDevices()
    if(ds.find(d => d.id === serial)) {
        const fridaDevice = await frida.getUsbDevice();
        fridaDevice.processCrashed.connect(onCrashed);
        onConnected(fridaDevice)
        return;
    }
    const tar = await deviceManager.addRemoteDevice(serial)
    if (!tar) {
        Logger.error(`[*] Frida device not connected to ${serial}`)
        onConnected(null)
    }
    deviceManager.added.connect(async () => {
        const fridaDevice = await frida.getUsbDevice();
        fridaDevice.processCrashed.connect(onCrashed);
        onConnected(fridaDevice)
    })
}

// Backward compatibility export (to be removed after refactor)
export const conenctFrida = connectFrida;

export const connectAdbDevice = async (serial:string):Promise<string> => {
    try{
        await adb.disconnect(serial);
    } catch (_) {};
    const result = await adb.connect(serial);
    if (!result) {
        Logger.error('[*] Failed to connect to adb server')
        return ''
    }
    return result
}

export const fileExist = async (id:string, version:string):Promise<string> => {
    if(id === '') {
        Logger.error('[*] ADB not connected');
        return '';
    }
    const files = await adb.readDir(id, '/data/local/tmp');
    const arch = await getArch(id);
    const file = files.find(file => ["frida", "frida-server", fileName(version, arch), fileNameFB(version, arch)].includes(file.name))
    if (!file) {
        Logger.error('[*] Frida server not found')
        return ""
    }
    return file.name
}

export const checkFridaPerm = async (id:string, filename:string):Promise<boolean> => {
    if(id === '') {
        Logger.error('[*] ADB not connected');
        return false;
    }
    const permissions = await adb.shell(id, `ls -l /data/local/tmp/${filename}`)
    if (!permissions.includes('rwxrwxrwx')) {
        try{
            const chmod = await adb.shell(id, `su -c "chmod 777 /data/local/tmp/${filename}"`)
            return true
        } catch (err) {
            Logger.error(`[*] Failed to change permissions: ${err}`)
            return false
        }
    } else {
        return true
    }
}

export const executeProcess = async (
    process:string,
    device:frida.Device,
    _script:string,
    recieveCallback:(message: frida.Message, data: Buffer | null) => void,
    attachCallback:() => void,
    disposeCallback:() => void,
    useEmulator:boolean = false
):Promise<[
    () => Promise<void>,
    frida.Script,
    number | null
]> => {
    const pid = await device.spawn([process])
    const session = await device.attach(pid, { realm: useEmulator ? frida.Realm.Emulated : frida.Realm.Native })
    Logger.info(`[*] Process attached`)
    const script = await session.createScript(_script)
    await script.load()
    await session.resume()
    await device.resume(pid)
    Logger.info(`[*] Session resumed`)
    attachCallback()
    script.message.connect(recieveCallback)
    session.detached.connect(disposeCallback)
    const dispose = async () => {
        script.message.disconnect(recieveCallback)
        session.detached.disconnect(disposeCallback)
        await session.detach()
    }
    return [dispose, script, pid]
}

export const attachProcess = async (
    pid:number,
    device:frida.Device,
    _script:string,
    recieveCallback:(message: frida.Message, data: Buffer | null) => void,
    attachCallback:() => void,
    disposeCallback:() => void,
    useEmulator:boolean = false
):Promise<[
    () => Promise<void>,
    frida.Script
]> => {
    if (!pid) {
        Logger.error(`[*] Process not found`)
        return [async () => {}, null]
    }
    const session = await device.attach(pid, { realm: useEmulator ? frida.Realm.Emulated : frida.Realm.Native })
    const script = await session.createScript(_script)
    await script.load()
    attachCallback()
    script.message.connect(recieveCallback)
    session.detached.connect(disposeCallback)
    const dispose = async () => {
        script.message.disconnect(recieveCallback)
        session.detached.disconnect(disposeCallback)
        await session.detach()
    }
    return [dispose, script]
}