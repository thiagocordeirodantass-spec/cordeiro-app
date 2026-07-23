// =============================================================================
//  services/chave.service.js — validação do DV (módulo 11) da chave de acesso
// =============================================================================
export function validarDigitoVerificadorChave(chave) {
  if (!/^\d{44}$/.test(chave)) return false;
  const digits = chave.split("").map(Number);
  const dvInformado = digits[43];
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += digits[i] * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dvCalculado = resto < 2 ? 0 : 11 - resto;
  return dvInformado === dvCalculado;
}
