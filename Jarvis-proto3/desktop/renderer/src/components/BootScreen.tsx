export function BootScreen() {
  return (
    <div className="boot-screen">
      <div>BOOT SEQUENCE READY</div>
      <div className="boot-muted">FIRMWARE .............. LATEST VERSION</div>
      <div className="boot-muted">CALIBRATION ........... RECENTLY UPDATED</div>
      <div className="boot-muted">AUDIO ................. OK</div>
      <div className="boot-muted">VIDEO ................. OK</div>
      <div className="boot-muted">MECHANICS ............. OK</div>
      <div>ALL SYSTEMS OPERATIONAL</div>
      <div className="boot-muted">Press any key to continue...</div>
    </div>
  );
}
