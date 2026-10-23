// CommonJS entry point for Plesk/Passenger. Local launchers keep using local-server.mjs.
import('./server/hosted.mjs').then(({createHostedServer})=>{
  const server=createHostedServer();
  const port=process.env.PORT||3000;
  server.on('error',()=>{console.error('Wardogs hosting listener failed. Check the hosting logs and port configuration.');process.exitCode=1;});
  server.listen(port,()=>console.log('Wardogs hosted site started. Payments remain sandbox-only.'));
  let stopping=false;
  const stop=()=>{
    if(stopping)return;stopping=true;
    server.close(()=>process.exit(0));server.closeIdleConnections();
    setTimeout(()=>{server.closeAllConnections();process.exit(0);},5000).unref();
  };
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}).catch(error=>{console.error('Wardogs hosting startup failed: '+error.message);process.exitCode=1;});
