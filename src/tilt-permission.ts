type PermissionSensor = {requestPermission?: () => Promise<string>};

// Called directly in a button handler: start both requests before yielding user activation.
export async function requestTiltPermission(): Promise<void> {
  if (!window.isSecureContext) throw new Error('端末の傾き操作はHTTPSで開いてください。');
  const orientation = window.DeviceOrientationEvent as PermissionSensor | undefined;
  const motion = window.DeviceMotionEvent as PermissionSensor | undefined;
  if (!orientation || !motion) throw new Error('このブラウザは端末の傾き操作に対応していません。');
  const requests: Promise<string>[] = [];
  for (const sensor of [orientation, motion]) {
    try {
      requests.push(sensor.requestPermission ? Promise.resolve(sensor.requestPermission()) : Promise.resolve('granted'));
    } catch (error) {
      requests.push(Promise.reject(error));
    }
  }
  const results = await Promise.allSettled(requests);
  if (results.some(result => result.status !== 'fulfilled' || result.value !== 'granted')) {
    throw new Error('端末の動きへのアクセスが許可されませんでした。指操作で遊べます。');
  }
}
