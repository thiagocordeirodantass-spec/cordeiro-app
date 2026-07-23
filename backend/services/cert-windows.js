// =============================================================================
//  services/cert-windows.js — deteccao de certificados A1 (.pfx/.p12) instalados
//  -----------------------------------------------------------------------------
//  Lista os certificados digitais instalados no repositorio pessoal (CurrentUser\My)
//  e no repositorio da maquina (LocalMachine\My) do Windows.
//
//  Como funciona:
//    - Usa o utilitario nativo `powershell.exe` com `Get-ChildItem Cert:\...`
//      para listar os certificados (mesma abordagem usada por browsers, ACBr, etc.)
//    - Para cada certificado, le: Subject, Issuer, Thumbprint, NotBefore, NotAfter
//    - Devolve uma lista JSON que o frontend exibe como dropdown
//    - Suporta Windows 10/11 (que e o alvo do projeto). Em outros SOs, retorna [].
//
//  Tambem expoe funcao para EXTRAIR o .pfx em bytes a partir do thumbprint
//  (usado quando o usuario seleciona um cert da maquina e o backend precisa
//  carregar o .pfx para usar nas chamadas SOAP).
// =============================================================================
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execFileP = promisify(execFile);

const isWindows = os.platform() === "win32";

// ---- PowerShell script: lista os certificados ----
// Filtra apenas certificados que tem chave privada (KeyAlgorithm != $null)
// e que ainda estao dentro da validade.
const PS_LIST = `
$ErrorActionPreference = 'SilentlyContinue'
$stores = @('Cert:\\CurrentUser\\My', 'Cert:\\LocalMachine\\My')
$out = @()
foreach ($s in $stores) {
  Get-ChildItem -Path $s -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } | ForEach-Object {
    $cn = $_.Subject
    if ($cn.Length -gt 100) { $cn = $cn.Substring(0, 100) + '...' }
    $out += @{
      thumbprint     = $_.Thumbprint
      subject        = $cn
      issuer         = if ($_.Issuer.Length -gt 100) { $_.Issuer.Substring(0, 100) + '...' } else { $_.Issuer }
      store          = $s
      notBefore      = $_.NotBefore.ToString('o')
      notAfter       = $_.NotAfter.ToString('o')
      friendlyName   = if ($_.FriendlyName) { $_.FriendlyName } else { '' }
      keyAlgorithm   = if ($_.PrivateKey.CspKeyContainerInfo) { $_.PrivateKey.CspKeyContainerInfo.KeyNumber } else { '' }
    }
  }
}
$out | ConvertTo-Json -Compress
`;

// ---- PowerShell script: extrai o .pfx em base64 (para usar no backend) ----
// O -Password protege o .pfx em transito; usamos uma senha aleatoria que sera
// descartada apos decodificar em memoria.
const PS_EXPORT = (thumbprint, password) => `
$ErrorActionPreference = 'Stop'
$pfxPath = Join-Path $env:TEMP ('cert-' + (New-Guid) + '.pfx')
try {
  $cert = Get-ChildItem -Path 'Cert:\\CurrentUser\\My\\${thumbprint}' -ErrorAction Stop
  if (-not $cert) {
    $cert = Get-ChildItem -Path 'Cert:\\LocalMachine\\My\\${thumbprint}' -ErrorAction Stop
  }
  if (-not $cert) { Write-Error 'Certificado nao encontrado'; exit 2 }
  $bytes = $cert.Export('PFX', '${password}')
  [System.IO.File]::WriteAllBytes($pfxPath, $bytes)
  $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($pfxPath))
  Write-Output $b64
} finally {
  if (Test-Path $pfxPath) { Remove-Item $pfxPath -Force }
}
`;

export async function listarCertificadosWindows() {
  if (!isWindows) return [];
  try {
    const { stdout } = await execFileP("powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_LIST],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30000 }
    );
    const txt = (stdout || "").trim();
    if (!txt) return [];
    const parsed = JSON.parse(txt);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((c) => ({
      thumbprint: c.thumbprint,
      subject: c.subject,
      issuer: c.issuer,
      store: c.store,
      notBefore: c.notBefore,
      notAfter: c.notAfter,
      friendlyName: c.friendlyName,
      // heuristica simples para label do dropdown
      label: c.friendlyName || extrairCNPJ(c.subject) || c.subject.split(",")[0].replace(/^CN=/, ""),
      // datas ja em ISO
      vence: c.notAfter ? c.notAfter.slice(0, 10) : "",
    }));
  } catch (e) {
    return [];
  }
}

// Extrai o CNPJ (14 digitos) do Subject, se tiver
function extrairCNPJ(subject) {
  const m = String(subject || "").match(/(\d{14})/);
  return m ? m[1] : null;
}

// Extrai o .pfx (bytes) do certificado do Windows Store
// Retorna Buffer com o conteudo do .pfx (exportado com a senha passada)
export async function exportarPfxWindows(thumbprint, senha) {
  if (!isWindows) throw new Error("Disponivel apenas no Windows");
  const passwd = String(senha || ""); // usado para criptografar o .pfx em transito
  const ps = PS_EXPORT(thumbprint, passwd.replace(/'/g, "''"));
  try {
    const { stdout } = await execFileP("powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { maxBuffer: 30 * 1024 * 1024, timeout: 30000 }
    );
    const b64 = (stdout || "").trim();
    if (!b64) throw new Error("Falha ao exportar o certificado");
    return Buffer.from(b64, "base64");
  } catch (e) {
    throw new Error("Nao foi possivel exportar o certificado: " + e.message);
  }
}
