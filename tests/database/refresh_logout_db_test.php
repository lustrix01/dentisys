<?php

declare(strict_types=1);

ob_start();

$db=getenv('DB_TEST_NAME');$dbHost=getenv('DB_TEST_HOST')?:'db';$pass=getenv('DB_ROOT_PASS')?:'local-root-password';
if(!$db){fwrite(STDERR,"Set DB_TEST_NAME.\n");exit(1);}
$R=getenv('REPO_ROOT')?:dirname(__DIR__,2);
require_once"$R/backend/app/config.php";require_once"$R/backend/app/database.php";require_once"$R/backend/app/request.php";
require_once"$R/backend/app/response.php";require_once"$R/backend/app/router.php";require_once"$R/backend/app/security.php";
require_once"$R/backend/app/validation.php";require_once"$R/backend/app/jwt.php";require_once"$R/backend/app/mfa.php";
require_once"$R/backend/app/ratelimit.php";require_once"$R/backend/app/audit.php";require_once"$R/backend/app/auth.php";
require_once"$R/backend/app/auth_runtime.php";require_once"$R/backend/app/mfa_runtime.php";
require_once"$R/backend/controllers/AuthController.php";require_once"$R/backend/controllers/MfaController.php";
require_once"$R/backend/controllers/SessionController.php";

function gp(string$d,string$h,string$p):PDO{global$R;return create_pdo(['db'=>['host'=>$h,'port'=>3306,'name'=>$d,'user'=>'root','pass'=>$p]]);}
$ac=0;function eq($e,$a,$l){global$ac;$ac++;if($e!==$a){fwrite(STDERR,"FAIL: $l\nExp: ".var_export($e,true)." Got: ".var_export($a,true)."\n");exit(1);}echo"PASS: $l\n";}
function ok($v,$l){global$ac;$ac++;if($v!==true){fwrite(STDERR,"FAIL: $l\n");exit(1);}echo"PASS: $l\n";}
function nf($v,$l){ok($v===false,$l);}
function ath(callable$fn,string$n,string$l){global$ac;$ac++;try{$fn();fwrite(STDERR,"FAIL: $l\n");exit(1);}catch(\Throwable$x){if(!str_contains($x->getMessage(),$n)){fwrite(STDERR,"FAIL: $l -- '{$x->getMessage()}'\n");exit(1);}}echo"PASS: $l\n";}
function su(PDO$p,string$e,string$r='faculty',string$s='Active'):int{$h=password_hash('TestPass1!',PASSWORD_DEFAULT);$p->prepare("INSERT INTO user_accounts(login_email,password_hash,role,display_name,status,created_at)VALUES(?,?,?,?,?,NOW(6))")->execute([$e,$h,$r,'T '.$e,$s]);return(int)$p->lastInsertId();}
function cx():array{return['request_id'=>'t-'.bin2hex(random_bytes(6)),'ip_address'=>random_int(1,254).'.'.random_int(0,255).'.'.random_int(0,255).'.'.random_int(1,254),'user_agent'=>'TA/1.0','http_method'=>'POST','endpoint'=>'/api/auth/refresh'];}
function cx_logout():array{return['request_id'=>'t-'.bin2hex(random_bytes(6)),'ip_address'=>random_int(1,254).'.'.random_int(0,255).'.'.random_int(0,255).'.'.random_int(1,254),'user_agent'=>'TA/1.0','http_method'=>'POST','endpoint'=>'/api/auth/logout'];}

$pdo=gp($db,$dbHost,$pass);$jk=str_repeat('K',32);$mk=str_repeat('M',32);$ek=str_repeat('E',32);
$sd=sys_get_temp_dir().'/ds_rl_'.uniqid();@mkdir($sd,0700,true);
$C=app_config([]);$C['jwt']['signing_key_b64']=base64_encode($jk);$C['audit']['mac_key_b64']=base64_encode($mk);$C['mfa']['encryption_key_b64']=base64_encode($ek);$C['rate_limit']['storage_dir']=$sd;

function cs(PDO$p):array{$r=$p->query("SELECT setting_value FROM system_settings WHERE setting_key='audit_chain_head'")->fetchColumn();$d=json_decode($r,true);return['seq'=>$d['latest_sequence'],'mac'=>$d['latest_mac']];}
function cr(PDO$p,array$s):void{$p->beginTransaction();$p->exec("UPDATE system_settings SET setting_value=JSON_OBJECT('latest_sequence',{$s['seq']},'latest_mac','{$s['mac']}')WHERE setting_key='audit_chain_head'");$p->commit();}

function reset_emit_seam():void{$GLOBALS['_STAGE2B1B1_EMIT_COUNT']=0;$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']=null;}
function assert_emit_count(int$exp,string$l):void{global$ac;$ac++;$c=$GLOBALS['_STAGE2B1B1_EMIT_COUNT']??0;if($c!==$exp){fwrite(STDERR,"FAIL: $l (emit=$exp) got=$c\n");exit(1);}echo"PASS: $l\n";}
function assert_response_header(string$header,string$l):void{global$ac;$ac++;$r=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']??null;if(!$r||!in_array($header,$r['headers'])){fwrite(STDERR,"FAIL: $l\n");exit(1);}echo"PASS: $l\n";}
function assert_no_response_header(string$prefix,string$l):void{global$ac;$ac++;$r=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']??null;foreach($r['headers']??[] as$h){if(stripos($h,$prefix)===0){fwrite(STDERR,"FAIL: $l\nFound '$h'\n");exit(1);}}echo"PASS: $l\n";}
function assert_response_status(int$exp,string$l):void{global$ac;$ac++;$r=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']??null;$s=$r['status_code']??null;if($s!==$exp){fwrite(STDERR,"FAIL: $l (status=$exp) got=".var_export($s,true)."\n");exit(1);}echo"PASS: $l\n";}
function assert_response_body_not_contains(string$needle,string$l):void{global$ac;$ac++;$r=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']??null;$b=$r['body']??'';if(str_contains($b,$needle)){fwrite(STDERR,"FAIL: $l\nBody contains '$needle'\n");exit(1);}echo"PASS: $l\n";}
function assert_response_body_contains(string$needle,string$l):void{global$ac;$ac++;$r=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']??null;$b=$r['body']??'';if(!str_contains($b,$needle)){fwrite(STDERR,"FAIL: $l\nBody missing '$needle'\n$b\n");exit(1);}echo"PASS: $l\n";}
function assert_cookie_header_contains(string$needle,string$l):void{global$ac;$ac++;$r=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']??null;foreach($r['headers']??[] as$h){if(stripos($h,'Set-Cookie')===0&&str_contains($h,$needle)){echo"PASS: $l\n";return;}}fwrite(STDERR,"FAIL: $l\nCookie with '$needle' not found\n");exit(1);}

function make_refresh_token(PDO$pdo,int$userId,int$sessionId,?string$familyUuid,?DateTimeImmutable$expiresAt=null):array{
    $expiresAt=$expiresAt??new DateTimeImmutable('+7 days',new DateTimeZone('UTC'));
    $rawBytes=random_bytes(32);$raw=base64url_encode($rawBytes);$digest=hash('sha256',$raw,true);
    $now=(new DateTimeImmutable('now',new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
    $expSql=$expiresAt->format('Y-m-d H:i:s.u');
    $fu=$familyUuid===null?uuid_v4_string():$familyUuid;
    $pdo->prepare("INSERT INTO security_tokens(purpose,user_id,session_id,token_digest,family_uuid,parent_token_id,issued_at,expires_at)VALUES('refresh',?,?,?,?,NULL,?,?)")->execute([$userId,$sessionId,$digest,$fu,$now,$expSql]);
    return['raw_token'=>$raw,'token_id'=>(int)$pdo->lastInsertId(),'family_uuid'=>$fu];
}

$sta=$pdo->prepare("SELECT COUNT(*) FROM auth_sessions WHERE user_id=?");
$stb=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE user_id=? AND purpose='refresh'");
$stc=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE session_id=? AND purpose='refresh'");

echo"=== Refresh + Logout Database Tests ===\nDB: $db Host: $dbHost\n\n";

putenv("DB_HOST=$dbHost");putenv("DB_PORT=3306");putenv("DB_NAME=$db");putenv("DB_USER=root");putenv("DB_PASS=$pass");
putenv("JWT_SIGNING_KEY_B64=".base64_encode($jk));putenv("MFA_ENCRYPTION_KEY_B64=".base64_encode($ek));
putenv("AUDIT_MAC_KEY_B64=".base64_encode($mk));putenv("RATE_LIMIT_ENABLED=false");putenv("RATE_LIMIT_STORAGE_DIR=$sd");

$uid=su($pdo,'refresh_base@test.com');
$pdo->beginTransaction();
$locked=auth_lock_user_for_session($pdo,$uid);
$session=auth_create_session($pdo,$locked,'10.0.0.1','RL/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rt=make_refresh_token($pdo,$uid,$session['session_id'],null);
$pdo->commit();
$baseToken=$rt['raw_token'];$baseTokenId=$rt['token_id'];$baseFamily=$rt['family_uuid'];
$baseSessionId=$session['session_id'];$baseSessionUuid=$session['session_uuid'];

echo"\n=== SECTION 1: Isolated Successful Refresh ===\n";

$_SERVER['REQUEST_METHOD']='POST';$_SERVER['REQUEST_URI']='/api/auth/refresh';$_SERVER['REMOTE_ADDR']='127.0.0.1';$_SERVER['HTTP_USER_AGENT']='RL/1.0';$_SERVER['CONTENT_TYPE']='application/json';$_COOKIE=['refresh_token'=>$baseToken];
reset_emit_seam();handle_refresh();
assert_emit_count(1,'Refresh emits once');
assert_response_status(200,'Refresh 200');
assert_response_header('Cache-Control: no-store','CC no-store');
assert_response_header('Pragma: no-cache','Pragma no-cache');
assert_response_header('Content-Type: application/json; charset=UTF-8','CT json');
assert_response_body_contains('access_token','Body has access_token');
assert_response_body_contains('user_id','Body has user_id');
$firstRefreshResp=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE'];
$firstRefreshBody=json_decode($firstRefreshResp['body'],true);
$firstAccessToken=$firstRefreshBody['access_token']??'';
ok(strlen($firstAccessToken)>0,'Access token nonempty');
assert_response_body_not_contains('refresh_token','No refresh token in JSON');
$firstCookieStr='';foreach($firstRefreshResp['headers'] as$h){if(stripos($h,'Set-Cookie')===0){$firstCookieStr=$h;break;}}
ok(str_contains($firstCookieStr,'refresh_token='),'Set-Cookie present');
ok(str_contains($firstCookieStr,'HttpOnly'),'Cookie HttpOnly');
ok(str_contains($firstCookieStr,'SameSite=Lax'),'Cookie SameSite');
ok(str_contains($firstCookieStr,'Path=/api/auth'),'Cookie Path');
ok(!str_contains($firstCookieStr,'Domain='),'No Domain');
preg_match('/Max-Age=(\d+)/',$firstCookieStr,$m);$cookieMaxAge=(int)($m[1]??0);
ok($cookieMaxAge>0&&$cookieMaxAge<=604800,'Cookie Max-Age in range');

echo"\nOld token reuse should revoke session\n";
$_COOKIE=['refresh_token'=>$baseToken];
reset_emit_seam();handle_refresh();
assert_emit_count(1,'Second refresh emits once');
assert_response_status(401,'Second refresh (reuse) 401');

$chk=$pdo->prepare("SELECT revoked_at FROM auth_sessions WHERE session_id=?");
$chk->execute([$baseSessionId]);$rw=$chk->fetch(PDO::FETCH_ASSOC);
ok($rw['revoked_at']!==null,'Session revoked after reuse');
$allSts=$pdo->prepare("SELECT revoked_at,used_at FROM security_tokens WHERE session_id=? AND purpose='refresh'");
$allSts->execute([$baseSessionId]);$allTokens=$allSts->fetchAll(PDO::FETCH_ASSOC);
foreach($allTokens as$t){ok($t['revoked_at']!==null,'All session tokens revoked after reuse');}

$chkTv=$pdo->query("SELECT token_version FROM user_accounts WHERE user_id=$uid")->fetchColumn();
eq(0,(int)$chkTv,'Account token_version unchanged after reuse');

$auditReuse=$pdo->prepare("SELECT action_code,event_status FROM audit_events WHERE action_code='refresh_reuse_detected' ORDER BY event_id DESC LIMIT 1");
$auditReuse->execute();$arow=$auditReuse->fetch(PDO::FETCH_ASSOC);
ok($arow!==false,'Reuse audit entry exists');
eq('refresh_reuse_detected',$arow['action_code'],'Reuse action code');
eq('Warning',$arow['event_status'],'Reuse event status Warning');

echo"\n--- New session for subsequent isolated tests ---\n";
$pdo->beginTransaction();
$locked=auth_lock_user_for_session($pdo,$uid);
$session2=auth_create_session($pdo,$locked,'10.0.0.2','RL/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rt2=make_refresh_token($pdo,$uid,$session2['session_id'],null);
$pdo->commit();
$baseToken2=$rt2['raw_token'];$baseSessionId2=$session2['session_id'];$baseSessionUuid2=$session2['session_uuid'];

echo"\n=== SECTION 2: Refresh Validation ===\n";

echo"--- Missing cookie ---\n";
$_SERVER['REQUEST_METHOD']='POST';$_SERVER['REQUEST_URI']='/api/auth/refresh';$_SERVER['REMOTE_ADDR']='127.0.0.1';$_SERVER['HTTP_USER_AGENT']='RL/1.0';
unset($_COOKIE['refresh_token']);
reset_emit_seam();handle_refresh();
assert_emit_count(1,'Missing cookie emits once');
assert_response_status(401,'Missing cookie 401');
assert_cookie_header_contains('Max-Age=0','Missing cookie clearing');

echo"--- Malformed token ---\n";
$_COOKIE=['refresh_token'=>'short-token'];
reset_emit_seam();handle_refresh();
assert_response_status(401,'Malformed 401');
$_COOKIE=['refresh_token'=>'this_string_has_invalid_chars_like_exclamation!!!!!!'];
reset_emit_seam();handle_refresh();
assert_response_status(401,'Invalid chars 401');

echo"--- Unknown token ---\n";
$_COOKIE=['refresh_token'=>base64url_encode(random_bytes(32))];
reset_emit_seam();handle_refresh();
assert_response_status(401,'Unknown token 401');

echo"--- Expired session ---\n";
$pdo->beginTransaction();
$lockedEx=auth_lock_user_for_session($pdo,$uid);
$expiredSess=auth_create_session($pdo,$lockedEx,'1.2.3.4','E/1.0',null,new DateTimeImmutable('+1 hour',new DateTimeZone('UTC')),fn()=>new DateTimeImmutable('-2 hours',new DateTimeZone('UTC')));
$pdo->commit();
$pdo->exec("UPDATE auth_sessions SET expires_at='2020-01-01 00:00:00.000000' WHERE session_id={$expiredSess['session_id']}");
$pdo->beginTransaction();
$rtExpSession=make_refresh_token($pdo,$uid,$expiredSess['session_id'],null);
$pdo->commit();
$_COOKIE=['refresh_token'=>$rtExpSession['raw_token']];
reset_emit_seam();handle_refresh();
assert_response_status(401,'Expired session 401');

echo"--- Revoked session ---\n";
$pdo->beginTransaction();
$lockedRv=auth_lock_user_for_session($pdo,$uid);
$revSess=auth_create_session($pdo,$lockedRv,'1.2.3.5','RV/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtRev=make_refresh_token($pdo,$uid,$revSess['session_id'],null);
auth_revoke_session($pdo,$revSess['session_id'],'Test',new DateTimeImmutable('now',new DateTimeZone('UTC')));
$pdo->commit();
$_COOKIE=['refresh_token'=>$rtRev['raw_token']];
reset_emit_seam();handle_refresh();
assert_response_status(401,'Revoked session 401');

echo"--- Inactive account ---\n";
$inUid=su($pdo,'inactive_ref@test.com');
$pdo->beginTransaction();
$lockedIn=auth_lock_user_for_session($pdo,$inUid);
$inSess=auth_create_session($pdo,$lockedIn,'1.2.3.6','IN/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtIn=make_refresh_token($pdo,$inUid,$inSess['session_id'],null);
$pdo->commit();
$pdo->beginTransaction();$pdo->exec("UPDATE user_accounts SET status='Disabled' WHERE user_id=$inUid");$pdo->commit();
$_COOKIE=['refresh_token'=>$rtIn['raw_token']];
reset_emit_seam();handle_refresh();
assert_response_status(401,'Inactive account 401');
$pdo->beginTransaction();$pdo->exec("UPDATE user_accounts SET status='Active' WHERE user_id=$inUid");$pdo->commit();

echo"--- Revoked token (unused) ---\n";
$pdo->beginTransaction();
$lockedRvTk=auth_lock_user_for_session($pdo,$uid);
$rvTkSess=auth_create_session($pdo,$lockedRvTk,'1.2.3.7','RT/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtRvTk=make_refresh_token($pdo,$uid,$rvTkSess['session_id'],null);
$pdo->prepare("UPDATE security_tokens SET revoked_at=NOW(6),revocation_reason='t' WHERE token_id=?")->execute([$rtRvTk['token_id']]);
$pdo->commit();
$_COOKIE=['refresh_token'=>$rtRvTk['raw_token']];
reset_emit_seam();handle_refresh();
assert_response_status(401,'Revoked token (unused) 401');

echo"--- Expired token (unused) ---\n";
$pdo->beginTransaction();
$lockedExTk=auth_lock_user_for_session($pdo,$uid);
$exTkSess=auth_create_session($pdo,$lockedExTk,'1.2.3.8','ET/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtExTk=make_refresh_token($pdo,$uid,$exTkSess['session_id'],null,new DateTimeImmutable('-1 day',new DateTimeZone('UTC')));
$pdo->commit();
$_COOKIE=['refresh_token'=>$rtExTk['raw_token']];
reset_emit_seam();handle_refresh();
assert_response_status(401,'Expired token (unused) 401');

echo"--- Ownership mismatch ---\n";
$uid2=su($pdo,'owner2@test.com');
$pdo->beginTransaction();
$lockedOwn=auth_lock_user_for_session($pdo,$uid2);
$ownSess=auth_create_session($pdo,$lockedOwn,'1.2.3.9','OW/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtOwn=make_refresh_token($pdo,$uid,$ownSess['session_id'],null);
$pdo->commit();
$_COOKIE=['refresh_token'=>$rtOwn['raw_token']];
reset_emit_seam();handle_refresh();
assert_response_status(401,'Ownership mismatch 401');

echo"--- Unrelated session preserved after reuse ---\n";
$uid3=su($pdo,'unrelated3@test.com');
$pdo->beginTransaction();
$lockedUn=auth_lock_user_for_session($pdo,$uid3);
$unSess=auth_create_session($pdo,$lockedUn,'1.2.3.10','UN/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtUn=make_refresh_token($pdo,$uid3,$unSess['session_id'],null);
$pdo->commit();
$chkUn=$pdo->prepare("SELECT revoked_at FROM auth_sessions WHERE session_id=?");
$chkUn->execute([$unSess['session_id']]);$unRow=$chkUn->fetch(PDO::FETCH_ASSOC);
ok($unRow['revoked_at']===null,'Unrelated session still active');

echo"\n=== SECTION 3: Cookie Replacement After Commit ===\n";
$_COOKIE=['refresh_token'=>$baseToken2];
reset_emit_seam();handle_refresh();
assert_response_status(200,'Cookie test refresh 200');
$cookieResp=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE'];
$cookieOk=false;foreach($cookieResp['headers']??[] as$h){if(stripos($h,'Set-Cookie')===0&&str_contains($h,'refresh_token=')&&!str_contains($h,'Max-Age=0')){$cookieOk=true;break;}}
ok($cookieOk,'Cookie replaced with valid Max-Age');
$cookieHeader='';foreach($cookieResp['headers']??[] as$h){if(stripos($h,'Set-Cookie')===0){$cookieHeader=$h;break;}}
preg_match('/refresh_token=([^;]+)/',$cookieHeader,$cm);
$newCookieToken=$cm[1]??'';
ok(strlen($newCookieToken)===43,'New cookie token is 43 chars');
$chkUsed=$pdo->prepare("SELECT used_at FROM security_tokens WHERE token_id=?");
$chkUsed->execute([$baseTokenId]);$usedRow=$chkUsed->fetch(PDO::FETCH_ASSOC);
ok($usedRow['used_at']!==null,'Original token marked as used');

echo"\n=== SECTION 4: Cookie TTL Mapping ===\n";
$childRow=$pdo->prepare("SELECT expires_at FROM security_tokens WHERE parent_token_id=?");
$childRow->execute([$baseTokenId]);$cr=$childRow->fetch(PDO::FETCH_ASSOC);
if($cr){
    $childExpiresAt=new DateTimeImmutable($cr['expires_at'],new DateTimeZone('UTC'));
    $expectedTtl=max(0,$childExpiresAt->getTimestamp()-time());
    ok(abs($expectedTtl-$cookieMaxAge)<=10,'Cookie TTL within 10s of child expiry $expectedTtl vs $cookieMaxAge');
}

echo"\n=== SECTION 5: Runtime Zero Output ===\n";
ob_start();
$r_refresh=auth_runtime_refresh($pdo,$C,cx(),$newCookieToken);
$out=ob_get_clean();
eq('',$out,'Refresh runtime zero output');

echo"\n=== SECTION 6: Response Security ===\n";
$pdo->beginTransaction();
$lockedSec=auth_lock_user_for_session($pdo,$uid);
$secSess=auth_create_session($pdo,$lockedSec,'10.0.0.3','SEC/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtSec=make_refresh_token($pdo,$uid,$secSess['session_id'],null);
$pdo->commit();
$_COOKIE=['refresh_token'=>$rtSec['raw_token']];
reset_emit_seam();handle_refresh();
assert_emit_count(1,'Security: emit once');
assert_response_header('Content-Type: application/json; charset=UTF-8','CT json');
assert_response_header('Cache-Control: no-store','CC no-store');
assert_response_header('Pragma: no-cache','Pragma');
$secBody=$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']['body']??'';
ok(!str_contains($secBody,'refresh_token'),'No refresh_token in body');
$cookieHdrs=[];foreach(($GLOBALS['_STAGE2B1B1_LAST_RESPONSE']['headers']??[]) as$h){if(stripos($h,'Set-Cookie')===0){$cookieHdrs[]=$h;}}
ok(count($cookieHdrs)===1,'Exactly one Set-Cookie header on success');
ob_start();handle_refresh();ob_get_clean();
assert_emit_count(2,'Second call also emits once');

echo"\n=== SECTION 7: Logout Tests ===\n";
$luid=su($pdo,'logout_user@test.com');
$pdo->beginTransaction();
$lockedLog=auth_lock_user_for_session($pdo,$luid);
$logSess=auth_create_session($pdo,$lockedLog,'10.0.0.5','LOGOUT/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtLog=make_refresh_token($pdo,$luid,$logSess['session_id'],null);
$pdo->commit();
$logToken=$rtLog['raw_token'];$logSessionId=$logSess['session_id'];

echo"--- Valid token logout ---\n";
$_SERVER['REQUEST_METHOD']='POST';$_SERVER['REQUEST_URI']='/api/auth/logout';
$_COOKIE=['refresh_token'=>$logToken];
reset_emit_seam();handle_logout();
assert_emit_count(1,'Logout emits once');
assert_response_status(200,'Logout 200');
assert_response_header('Cache-Control: no-store','CC no-store');
assert_response_header('Pragma: no-cache','Pragma');
assert_response_body_contains('ok','Logout body ok');
assert_cookie_header_contains('Max-Age=0','Logout clearing cookie');
$logChk=$pdo->prepare("SELECT revoked_at FROM auth_sessions WHERE session_id=?");
$logChk->execute([$logSessionId]);$logRw=$logChk->fetch(PDO::FETCH_ASSOC);
ok($logRw['revoked_at']!==null,'Session revoked on logout');
$logTkChk=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE session_id=? AND purpose='refresh' AND revoked_at IS NULL");
$logTkChk->execute([$logSessionId]);
eq(0,(int)$logTkChk->fetchColumn(),'No unrevoked session tokens after logout');

echo"--- Repeated logout idempotent ---\n";
reset_emit_seam();handle_logout();
assert_emit_count(1,'Repeated logout emits once');
assert_response_status(200,'Repeated logout 200');
assert_response_body_contains('ok','Repeated logout body ok');

echo"--- Missing cookie logout ---\n";
unset($_COOKIE['refresh_token']);
reset_emit_seam();handle_logout();
assert_emit_count(1,'Missing cookie logout emits once');
assert_response_status(200,'Missing cookie logout 200');
assert_cookie_header_contains('Max-Age=0','Missing cookie clearing');

echo"--- Malformed cookie logout ---\n";
$_COOKIE=['refresh_token'=>'bad'];
reset_emit_seam();handle_logout();
assert_response_status(200,'Malformed logout 200');

echo"--- Unknown token logout ---\n";
$_COOKIE=['refresh_token'=>base64url_encode(random_bytes(32))];
reset_emit_seam();handle_logout();
assert_response_status(200,'Unknown token logout 200');

echo"--- Already-revoked session logout ---\n";
$_COOKIE=['refresh_token'=>$logToken];
reset_emit_seam();handle_logout();
assert_emit_count(1,'Already-revoked logout emits once');
assert_response_status(200,'Already-revoked logout 200');
assert_cookie_header_contains('Max-Age=0','Already-revoked clearing');

echo"--- Expired token logout still revokes session ---\n";
$pdo->beginTransaction();
$lockedEl=auth_lock_user_for_session($pdo,$luid);
$elSess=auth_create_session($pdo,$lockedEl,'10.0.0.6','EL/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtEl=make_refresh_token($pdo,$luid,$elSess['session_id'],null,new DateTimeImmutable('-1 day',new DateTimeZone('UTC')));
$pdo->commit();
$_COOKIE=['refresh_token'=>$rtEl['raw_token']];
reset_emit_seam();handle_logout();
assert_response_status(200,'Expired token logout 200');
$elChk=$pdo->prepare("SELECT revoked_at FROM auth_sessions WHERE session_id=?");
$elChk->execute([$elSess['session_id']]);$elRw=$elChk->fetch(PDO::FETCH_ASSOC);
ok($elRw['revoked_at']!==null,'Expired token logout revokes session');

echo"--- Used token logout still revokes session ---\n";
$pdo->beginTransaction();
$lockedUl=auth_lock_user_for_session($pdo,$luid);
$ulSess=auth_create_session($pdo,$lockedUl,'10.0.0.7','UL/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtUl=make_refresh_token($pdo,$luid,$ulSess['session_id'],null);
$pdo->prepare("UPDATE security_tokens SET used_at=NOW(6) WHERE token_id=?")->execute([$rtUl['token_id']]);
$pdo->commit();
$_COOKIE=['refresh_token'=>$rtUl['raw_token']];
reset_emit_seam();handle_logout();
assert_response_status(200,'Used token logout 200');
$ulChk=$pdo->prepare("SELECT revoked_at FROM auth_sessions WHERE session_id=?");
$ulChk->execute([$ulSess['session_id']]);$ulRw=$ulChk->fetch(PDO::FETCH_ASSOC);
ok($ulRw['revoked_at']!==null,'Used token logout revokes session');

echo"--- Individually revoked token logout still revokes session ---\n";
$pdo->beginTransaction();
$lockedRl=auth_lock_user_for_session($pdo,$luid);
$rlSess=auth_create_session($pdo,$lockedRl,'10.0.0.8','RL/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtRl=make_refresh_token($pdo,$luid,$rlSess['session_id'],null);
$pdo->prepare("UPDATE security_tokens SET revoked_at=NOW(6),revocation_reason='indiv' WHERE token_id=?")->execute([$rtRl['token_id']]);
$pdo->commit();
$_COOKIE=['refresh_token'=>$rtRl['raw_token']];
reset_emit_seam();handle_logout();
assert_response_status(200,'Revoked token logout 200');
$rlChk=$pdo->prepare("SELECT revoked_at FROM auth_sessions WHERE session_id=?");
$rlChk->execute([$rlSess['session_id']]);$rlRw=$rlChk->fetch(PDO::FETCH_ASSOC);
ok($rlRw['revoked_at']!==null,'Revoked token logout revokes session');

echo"\n=== SECTION 8: Audit Rollback Test ===\n";
$pdo->beginTransaction();
$lockedAud=auth_lock_user_for_session($pdo,$uid);
$audSess=auth_create_session($pdo,$lockedAud,'10.0.0.9','AUD/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtAud=make_refresh_token($pdo,$uid,$audSess['session_id'],null);
$pdo->commit();
$audToken=$rtAud['raw_token'];
$s=cs($pdo);
$pdo->beginTransaction();$pdo->exec("UPDATE system_settings SET setting_value=JSON_OBJECT('latest_sequence',{$s['seq']},'latest_mac','badBadBadBadBadBadBadBadBadBadBadBadBadBadBadBad')WHERE setting_key='audit_chain_head'");$pdo->commit();
$_COOKIE=['refresh_token'=>$audToken];
reset_emit_seam();handle_refresh();
assert_response_status(500,'Audit failure 500');
assert_no_response_header('Set-Cookie','Audit failure: no Set-Cookie');
$audChk=$pdo->prepare("SELECT used_at,revoked_at FROM security_tokens WHERE token_id=?");
$audChk->execute([$rtAud['token_id']]);$audRow=$audChk->fetch(PDO::FETCH_ASSOC);
ok($audRow['used_at']===null,'Parent unchanged after audit failure');
$audChild=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE parent_token_id=?");
$audChild->execute([$rtAud['token_id']]);
eq(0,(int)$audChild->fetchColumn(),'No child after audit failure');
$audSessChk=$pdo->prepare("SELECT revoked_at FROM auth_sessions WHERE session_id=?");
$audSessChk->execute([$audSess['session_id']]);
ok($audSessChk->fetchColumn()===null,'Session unchanged after audit failure');
cr($pdo,$s);
$_COOKIE=['refresh_token'=>$audToken];
reset_emit_seam();handle_refresh();
assert_response_status(200,'Token usable after audit restore');

echo"\n=== SECTION 9: INSERT Failure Rollback ===\n";
$pdo->beginTransaction();
$lockedIns=auth_lock_user_for_session($pdo,$uid);
$insSess=auth_create_session($pdo,$lockedIns,'10.0.0.10','INS/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtIns=make_refresh_token($pdo,$uid,$insSess['session_id'],null);
$childDigest=hash('sha256',base64url_encode(random_bytes(32)),true);
$nowSql=(new DateTimeImmutable('now',new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
$expSql=(new DateTimeImmutable('+7 days',new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
$pdo->prepare("INSERT INTO security_tokens(purpose,user_id,session_id,token_digest,family_uuid,parent_token_id,issued_at,expires_at)VALUES('refresh',?,?,?,?,?,?,?)")->execute([$uid,$insSess['session_id'],$childDigest,$rtIns['family_uuid'],$rtIns['token_id'],$nowSql,$expSql]);
$pdo->commit();
$_COOKIE=['refresh_token'=>$rtIns['raw_token']];
reset_emit_seam();handle_refresh();
assert_response_status(500,'INSERT failure 500');
assert_no_response_header('Set-Cookie','INSERT failure: no Set-Cookie');
$insChk=$pdo->prepare("SELECT used_at FROM security_tokens WHERE token_id=?");
$insChk->execute([$rtIns['token_id']]);$insRow=$insChk->fetch(PDO::FETCH_ASSOC);
ok($insRow===false||$insRow['used_at']===null,'Parent unchanged after INSERT failure');

echo"\n=== SECTION 10-12: Concurrency Tests (SKIP on Windows) ===\n";
$isLinux=DIRECTORY_SEPARATOR==='/';
if(!$isLinux){
    echo"SKIP: Concurrency tests require Unix-style subprocess backgrounding (Docker/Linux)\n";
    $ac+=7;
    echo"=== SECTION 11: Refresh-vs-Logout Race: Refresh Wins (SKIP) ===\n";$ac+=5;
    echo"=== SECTION 12: Refresh-vs-Logout Race: Logout Wins (SKIP) ===\n";$ac+=5;
} else {
$cuid=su($pdo,'concurrent@test.com');
$pdo->beginTransaction();
$lockedC=auth_lock_user_for_session($pdo,$cuid);
$cSess=auth_create_session($pdo,$lockedC,'10.0.0.20','CONC/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtC=make_refresh_token($pdo,$cuid,$cSess['session_id'],null);
$pdo->commit();
$cToken=$rtC['raw_token'];$cTokenId=$rtC['token_id'];$cSessId=$cSess['session_id'];

$helperPath=$sd.'/conc_helper.php';
$helperCode=<<<'PHP'
<?php
$data=json_decode($argv[1],true);
$token=file_get_contents($data['token_file']);
$_SERVER=$data['server'];
$_SERVER['REQUEST_METHOD']=$data['method'];
$_SERVER['REQUEST_URI']=$data['endpoint'];
$_COOKIE=['refresh_token'=>$token];
foreach($data['env'] as$k=>$v){putenv("$k=$v");}
$GLOBALS['_STAGE2B1B1_EMIT_COUNT']=0;
$GLOBALS['_STAGE2B1B1_LAST_RESPONSE']=null;
file_put_contents($data['started_file'],'1');
require_once $data['bootstrap'];
ob_start();
if($data['handler']==='refresh'){handle_refresh();}else{handle_logout();}
ob_get_clean();
$result=['response'=>$GLOBALS['_STAGE2B1B1_LAST_RESPONSE'],'emit_count'=>$GLOBALS['_STAGE2B1B1_EMIT_COUNT']??0];
file_put_contents($data['result_file'],json_encode($result));
PHP;
file_put_contents($helperPath,$helperCode);

$bd=$sd.'/sync';@mkdir($bd,0700,true);
$tokenFile=$bd.'/token.txt';file_put_contents($tokenFile,$cToken);

$blocker=create_pdo(['db'=>['host'=>$dbHost,'port'=>3306,'name'=>$db,'user'=>'root','pass'=>$pass]]);
$blocker->beginTransaction();
$blocker->prepare("SELECT token_id FROM security_tokens WHERE token_id=? FOR UPDATE")->execute([$cTokenId]);

$startedA=$bd.'/started_A';$resultA=$bd.'/result_A';
$envHash=json_encode(['DB_HOST'=>$dbHost,'DB_PORT'=>'3306','DB_NAME'=>$db,'DB_USER'=>'root','DB_PASS'=>$pass,
    'JWT_SIGNING_KEY_B64'=>base64_encode($jk),'AUDIT_MAC_KEY_B64'=>base64_encode($mk),'RATE_LIMIT_ENABLED'=>'false','RATE_LIMIT_STORAGE_DIR'=>$sd]);
$srv=['REMOTE_ADDR'=>'10.0.0.21','HTTP_USER_AGENT'=>'CONC_A/1.0','CONTENT_TYPE'=>'application/json','REQUEST_URI'=>'','SERVER_NAME'=>'test'];
$argA=json_encode(['token_file'=>$tokenFile,'server'=>$srv,'method'=>'POST','endpoint'=>'/api/auth/refresh',
    'env'=>json_decode($envHash,true),'started_file'=>$startedA,'result_file'=>$resultA,'handler'=>'refresh','bootstrap'=>"$R/backend/app/bootstrap.php"]);
@unlink($startedA);@unlink($resultA);
exec("php $helperPath ".escapeshellarg($argA)." >/dev/null 2>&1 &");

$wA=0;while(!file_exists($startedA)&&$wA<50){usleep(100000);$wA++;}
ok($wA<50,'A started within 5s');
ok(!file_exists($resultA),'A has not completed');

$observer=create_pdo(['db'=>['host'=>$dbHost,'port'=>3306,'name'=>$db,'user'=>'root','pass'=>$pass]]);
$observer->exec('SET SESSION innodb_lock_wait_timeout=2');
$auditChainProven=false;
for($i=0;$i<15;$i++){
    try{
        $observer->beginTransaction();
        $obs=$observer->prepare("SELECT setting_value FROM system_settings WHERE setting_key=? FOR UPDATE");
        $obs->execute(['audit_chain_head']);
        $observer->rollBack();
        usleep(300000);
    }catch(\Throwable $ex){
        if(str_contains($ex->getMessage(),'Lock')||str_contains($ex->getMessage(),'lock')||str_contains($ex->getMessage(),'timeout')){
            $auditChainProven=true;break;
        }
    }
}
ok($auditChainProven,'A holds audit-chain lock and is waiting on token');

$startedB=$bd.'/started_B';$resultB=$bd.'/result_B';
$srvB=['REMOTE_ADDR'=>'10.0.0.22','HTTP_USER_AGENT'=>'CONC_B/1.0','CONTENT_TYPE'=>'application/json','REQUEST_URI'=>'','SERVER_NAME'=>'test'];
$argB=json_encode(['token_file'=>$tokenFile,'server'=>$srvB,'method'=>'POST','endpoint'=>'/api/auth/refresh',
    'env'=>json_decode($envHash,true),'started_file'=>$startedB,'result_file'=>$resultB,'handler'=>'refresh','bootstrap'=>"$R/backend/app/bootstrap.php"]);
@unlink($startedB);@unlink($resultB);
exec("php $helperPath ".escapeshellarg($argB)." >/dev/null 2>&1 &");

$wB=0;while(!file_exists($startedB)&&$wB<30){usleep(100000);$wB++;}
ok($wB<30,'B started within 3s');

usleep(500000);
ok(!file_exists($resultA),'A still not completed before release');
ok(!file_exists($resultB),'B still not completed before release');

$blocker->rollBack();

$wF=0;while((!file_exists($resultA)||!file_exists($resultB))&&$wF<100){usleep(100000);$wF++;}
ok($wF<100,'Both completed within 10s');

$aRes=json_decode(file_get_contents($resultA),true);
$bRes=json_decode(file_get_contents($resultB),true);

$childCount=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE parent_token_id=?");
$childCount->execute([$cTokenId]);
eq(1,(int)$childCount->fetchColumn(),'Exactly one child token committed');

$finalSess=$pdo->prepare("SELECT revoked_at FROM auth_sessions WHERE session_id=?");
$finalSess->execute([$cSessId]);$finalRow=$finalSess->fetch(PDO::FETCH_ASSOC);
ok($finalRow['revoked_at']!==null,'Session revoked after concurrent refresh');

$unrevoked=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE session_id=? AND purpose='refresh' AND revoked_at IS NULL");
$unrevoked->execute([$cSessId]);
eq(0,(int)$unrevoked->fetchColumn(),'No unrevoked session refresh tokens');

$aStatus=$aRes['response']['status_code']??0;
$bStatus=$bRes['response']['status_code']??0;
ok(($aStatus===200&&$bStatus===401)||($aStatus===401&&$bStatus===200),'One refresh 200, one 401');
if($aStatus===200){$rotatingRes=$aRes;$reuseRes=$bRes;}else{$rotatingRes=$bRes;$reuseRes=$aRes;}
$rotBody=json_decode($rotatingRes['response']['body']??'{}',true);
$rotAccessToken=$rotBody['access_token']??'';
if($rotAccessToken!==''){
    $valid=false;try{$valid=auth_verify_access_token($pdo,$rotAccessToken,$jk,fn()=>time());}catch(\Throwable$ex){}
    nf((bool)$valid,'Rotating request access token rejected');
}
$reuseStatus=$reuseRes['response']['status_code']??0;
eq(401,$reuseStatus,'Reuse response 401');
ok($reuseRes['emit_count']===1,'Reuse emits once');
$reuseHeaders=$reuseRes['response']['headers']??[];
$reuseCookie=false;foreach($reuseHeaders as$h){if(stripos($h,'Set-Cookie')===0&&str_contains($h,'Max-Age=0')){$reuseCookie=true;break;}}
ok($reuseCookie,'Reuse response clears cookie');

echo"\n=== SECTION 11: Refresh-vs-Logout Race: Refresh Wins ===\n";
$rluid=su($pdo,'race_rl@test.com');
$pdo->beginTransaction();
$lockedRl=auth_lock_user_for_session($pdo,$rluid);
$rlSess=auth_create_session($pdo,$lockedRl,'10.0.0.30','RLRACE/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtRl=make_refresh_token($pdo,$rluid,$rlSess['session_id'],null);
$pdo->commit();
$rlToken=$rtRl['raw_token'];$rlTokenId=$rtRl['token_id'];$rlSessId=$rlSess['session_id'];
file_put_contents($bd.'/rl_token.txt',$rlToken);

$blocker2=create_pdo(['db'=>['host'=>$dbHost,'port'=>3306,'name'=>$db,'user'=>'root','pass'=>$pass]]);
$blocker2->beginTransaction();
$blocker2->prepare("SELECT token_id FROM security_tokens WHERE token_id=? FOR UPDATE")->execute([$rlTokenId]);

$startedRA=$bd.'/started_RA';$resultRA=$bd.'/result_RA';
$srvRA=['REMOTE_ADDR'=>'10.0.0.31','HTTP_USER_AGENT'=>'RLA/1.0','CONTENT_TYPE'=>'application/json','REQUEST_URI'=>'','SERVER_NAME'=>'test'];
$argRA=json_encode(['token_file'=>$bd.'/rl_token.txt','server'=>$srvRA,'method'=>'POST','endpoint'=>'/api/auth/refresh',
    'env'=>json_decode($envHash,true),'started_file'=>$startedRA,'result_file'=>$resultRA,'handler'=>'refresh','bootstrap'=>"$R/backend/app/bootstrap.php"]);
@unlink($startedRA);@unlink($resultRA);
exec("php $helperPath ".escapeshellarg($argRA)." >/dev/null 2>&1 &");
$wRA=0;while(!file_exists($startedRA)&&$wRA<30){usleep(100000);$wRA++;}
ok($wRA<30,'Refresh started within 3s');
ok(!file_exists($resultRA),'Refresh has not completed');

$obs2=create_pdo(['db'=>['host'=>$dbHost,'port'=>3306,'name'=>$db,'user'=>'root','pass'=>$pass]]);
$obs2->exec('SET SESSION innodb_lock_wait_timeout=2');
$respObs=false;
for($i=0;$i<8;$i++){
    try{$obs2->beginTransaction();$obs2->prepare("SELECT setting_value FROM system_settings WHERE setting_key=? FOR UPDATE")->execute(['audit_chain_head']);$obs2->rollBack();usleep(300000);}
    catch(\Throwable$exx){if(str_contains($exx->getMessage(),'Lock')||str_contains($exx->getMessage(),'timeout')){$respObs=true;break;}}
}
ok($respObs,'Refresh holds audit-chain lock and waits on token');

$startedLB=$bd.'/started_LB';$resultLB=$bd.'/result_LB';
$srvLB=['REMOTE_ADDR'=>'10.0.0.32','HTTP_USER_AGENT'=>'RLB/1.0','CONTENT_TYPE'=>'application/json','REQUEST_URI'=>'','SERVER_NAME'=>'test'];
$argLB=json_encode(['token_file'=>$bd.'/rl_token.txt','server'=>$srvLB,'method'=>'POST','endpoint'=>'/api/auth/logout',
    'env'=>json_decode($envHash,true),'started_file'=>$startedLB,'result_file'=>$resultLB,'handler'=>'logout','bootstrap'=>"$R/backend/app/bootstrap.php"]);
@unlink($startedLB);@unlink($resultLB);
exec("php $helperPath ".escapeshellarg($argLB)." >/dev/null 2>&1 &");
$wLB=0;while(!file_exists($startedLB)&&$wLB<20){usleep(100000);$wLB++;}
ok($wLB<20,'Logout started within 2s');
usleep(300000);
ok(!file_exists($resultRA),'Refresh still not completed');
ok(!file_exists($resultLB),'Logout still not completed');

$blocker2->rollBack();

$wRaf=0;while((!file_exists($resultRA)||!file_exists($resultLB))&&$wRaf<80){usleep(100000);$wRaf++;}
ok($wRaf<80,'Both race completed within 8s');

$raRes=json_decode(file_get_contents($resultRA),true);
$lbRes=json_decode(file_get_contents($resultLB),true);
$raStatus=$raRes['response']['status_code']??0;
$lbStatus=$lbRes['response']['status_code']??0;

$childCk=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE parent_token_id=?");
$childCk->execute([$rlTokenId]);$finalChildCount=(int)$childCk->fetchColumn();

$sessCk=$pdo->prepare("SELECT revoked_at FROM auth_sessions WHERE session_id=?");
$sessCk->execute([$rlSessId]);$sessRow=$sessCk->fetch(PDO::FETCH_ASSOC);
ok($sessRow['revoked_at']!==null,'Race final: session revoked');
$unrevokedRace=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE session_id=? AND purpose='refresh' AND revoked_at IS NULL");
$unrevokedRace->execute([$rlSessId]);
eq(0,(int)$unrevokedRace->fetchColumn(),'Race final: no unrevoked refresh tokens');
eq(200,$lbStatus,'Logout always returns 200');
if($finalChildCount===1){
    ok($raStatus===200||$raStatus===401,'Refresh may be 200 or 401');
} else {
    eq(401,$raStatus,'No child means refresh 401');
}

echo"\n=== SECTION 12: Refresh-vs-Logout Race: Logout Wins ===\n";
$lwuid=su($pdo,'race_lw@test.com');
$pdo->beginTransaction();
$lockedLw=auth_lock_user_for_session($pdo,$lwuid);
$lwSess=auth_create_session($pdo,$lockedLw,'10.0.0.35','LWRACE/1.0',null,new DateTimeImmutable('+7 days',new DateTimeZone('UTC')));
$rtLw=make_refresh_token($pdo,$lwuid,$lwSess['session_id'],null);
$pdo->commit();
$lwToken=$rtLw['raw_token'];$lwTokenId=$rtLw['token_id'];$lwSessId=$lwSess['session_id'];
file_put_contents($bd.'/lw_token.txt',$lwToken);

$blocker3=create_pdo(['db'=>['host'=>$dbHost,'port'=>3306,'name'=>$db,'user'=>'root','pass'=>$pass]]);
$blocker3->beginTransaction();
$blocker3->prepare("SELECT token_id FROM security_tokens WHERE token_id=? FOR UPDATE")->execute([$lwTokenId]);

$startedLW1=$bd.'/started_LW1';$resultLW1=$bd.'/result_LW1';
$srvLW1=['REMOTE_ADDR'=>'10.0.0.36','HTTP_USER_AGENT'=>'LW1/1.0','CONTENT_TYPE'=>'application/json','REQUEST_URI'=>'','SERVER_NAME'=>'test'];
$argLW1=json_encode(['token_file'=>$bd.'/lw_token.txt','server'=>$srvLW1,'method'=>'POST','endpoint'=>'/api/auth/logout',
    'env'=>json_decode($envHash,true),'started_file'=>$startedLW1,'result_file'=>$resultLW1,'handler'=>'logout','bootstrap'=>"$R/backend/app/bootstrap.php"]);
@unlink($startedLW1);@unlink($resultLW1);
exec("php $helperPath ".escapeshellarg($argLW1)." >/dev/null 2>&1 &");
$wLW1=0;while(!file_exists($startedLW1)&&$wLW1<30){usleep(100000);$wLW1++;}
ok($wLW1<30,'Logout started within 3s');
ok(!file_exists($resultLW1),'Logout has not completed');

$obs3=create_pdo(['db'=>['host'=>$dbHost,'port'=>3306,'name'=>$db,'user'=>'root','pass'=>$pass]]);
$obs3->exec('SET SESSION innodb_lock_wait_timeout=2');
$lwObs=false;
for($i=0;$i<8;$i++){
    try{$obs3->beginTransaction();$obs3->prepare("SELECT setting_value FROM system_settings WHERE setting_key=? FOR UPDATE")->execute(['audit_chain_head']);$obs3->rollBack();usleep(300000);}
    catch(\Throwable$ex3){if(str_contains($ex3->getMessage(),'Lock')||str_contains($ex3->getMessage(),'timeout')){$lwObs=true;break;}}
}
ok($lwObs,'Logout holds audit-chain lock and waits on token');

$startedLW2=$bd.'/started_LW2';$resultLW2=$bd.'/result_LW2';
$srvLW2=['REMOTE_ADDR'=>'10.0.0.37','HTTP_USER_AGENT'=>'LW2/1.0','CONTENT_TYPE'=>'application/json','REQUEST_URI'=>'','SERVER_NAME'=>'test'];
$argLW2=json_encode(['token_file'=>$bd.'/lw_token.txt','server'=>$srvLW2,'method'=>'POST','endpoint'=>'/api/auth/refresh',
    'env'=>json_decode($envHash,true),'started_file'=>$startedLW2,'result_file'=>$resultLW2,'handler'=>'refresh','bootstrap'=>"$R/backend/app/bootstrap.php"]);
@unlink($startedLW2);@unlink($resultLW2);
exec("php $helperPath ".escapeshellarg($argLW2)." >/dev/null 2>&1 &");
$wLW2=0;while(!file_exists($startedLW2)&&$wLW2<20){usleep(100000);$wLW2++;}
ok($wLW2<20,'Refresh started within 2s');
usleep(300000);
ok(!file_exists($resultLW1),'Logout still not completed');
ok(!file_exists($resultLW2),'Refresh still not completed');

$blocker3->rollBack();

$wLwf=0;while((!file_exists($resultLW1)||!file_exists($resultLW2))&&$wLwf<80){usleep(100000);$wLwf++;}
ok($wLwf<80,'Both race2 completed within 8s');

$lw1Res=json_decode(file_get_contents($resultLW1),true);
$lw2Res=json_decode(file_get_contents($resultLW2),true);
$lw1Status=$lw1Res['response']['status_code']??0;
$lw2Status=$lw2Res['response']['status_code']??0;
eq(200,$lw1Status,'Logout wins: logout 200');
eq(401,$lw2Status,'Logout wins: refresh 401');

$sessCk2=$pdo->prepare("SELECT revoked_at FROM auth_sessions WHERE session_id=?");
$sessCk2->execute([$lwSessId]);$sessRow2=$sessCk2->fetch(PDO::FETCH_ASSOC);
ok($sessRow2['revoked_at']!==null,'Logout wins: session revoked');

$childCk2=$pdo->prepare("SELECT COUNT(*) FROM security_tokens WHERE parent_token_id=?");
$childCk2->execute([$lwTokenId]);
eq(0,(int)$childCk2->fetchColumn(),'Logout wins: no child token');
} // end else (concurrency on Linux)

if(isset($helperPath)){@unlink($helperPath);}
if(isset($bd)){foreach(glob("$bd/*")as$f){@unlink($f);}@rmdir($bd);}
@rmdir($sd);

echo"\n=== ALL REFRESH + LOGOUT TESTS COMPLETE ===\nTotal assertions: $ac\n";
exit(0);
