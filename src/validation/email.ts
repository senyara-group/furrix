// Adresse e-mail : format réel (partie locale, domaine, extension), fautes de frappe courantes et adresses jetables.
// La même liste de domaines jetables est vérifiée côté serveur à l'inscription (migration disposable_email_domains).

/** Domaines d'adresses jetables ou temporaires les plus répandus (le domaine et tous ses sous-domaines). */
export const DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  '0-mail.com', '10minutemail.com', '10minutemail.net', '10minutemail.co.uk', '20minutemail.com', '33mail.com', 'anonaddy.me',
  'armyspy.com', 'burnermail.io', 'byom.de', 'cock.li', 'cuvox.de', 'dayrep.com', 'discard.email', 'discardmail.com',
  'dispostable.com', 'dropmail.me', 'email-fake.com', 'emailfake.com', 'emailondeck.com', 'emailtemporanea.com', 'fakeinbox.com',
  'fakemail.net', 'fakemailgenerator.com', 'fleckens.hu', 'getairmail.com', 'getnada.com', 'gishpuppy.com', 'grr.la',
  'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailblock.com', 'harakirimail.com', 'inboxbear.com', 'incognitomail.org', 'jetable.org', 'jourrapide.com',
  'kurzepost.de', 'mail-temp.com', 'mail.tm', 'mail7.io', 'maildrop.cc', 'mailcatch.com', 'maildax.com', 'mailinator.com',
  'mailinator.net', 'mailinator2.com', 'mailnesia.com', 'mailnull.com', 'mailpoof.com', 'mailsac.com', 'mailtemp.net',
  'mintemail.com', 'moakt.com', 'mohmal.com', 'mt2015.com', 'mytemp.email', 'mytrashmail.com', 'nada.email', 'nospam.ze.tc',
  'nowmymail.com', 'one-time.email', 'owlymail.com', 'pokemail.net', 'rhyta.com', 'sharklasers.com', 'spam4.me', 'spambog.com',
  'spambox.us', 'spamgourmet.com', 'spamex.com', 'superrito.com', 'teleworm.us', 'temp-mail.io', 'temp-mail.org', 'tempail.com',
  'tempinbox.com', 'tempmail.com', 'tempmail.dev', 'tempmail.net', 'tempmail.plus', 'tempmailo.com', 'tempr.email',
  'throwawaymail.com', 'tmail.ws', 'tmailor.com', 'tmpmail.net', 'tmpmail.org', 'trash-mail.com', 'trashmail.com', 'trashmail.de',
  'trashmail.io', 'trashmail.net', 'trbvm.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.fr.nf',
  'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf', 'speed.1s.fr', 'zetmail.com', 'emltmp.com',
  'luxusmail.org', 'minuteinbox.com', 'mailforspam.com', 'spamfree24.org', 'wegwerfmail.de', 'wegwerfmail.net', 'einrot.com',
  'gustr.com', 'tempmailaddress.com', 'temporary-mail.net', 'disposablemail.com', 'easytrashmail.com', 'linshiyouxiang.net',
];

/** Fautes de frappe fréquentes sur les grands fournisseurs : on propose la bonne adresse au lieu de l'envoyer dans le vide. */
const TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.fr': 'gmail.com', 'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmali.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmai.fr': 'hotmail.fr', 'hotmial.fr': 'hotmail.fr',
  'hotmal.fr': 'hotmail.fr', 'hotmail.fe': 'hotmail.fr', 'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'outlok.fr': 'outlook.fr', 'yahou.fr': 'yahoo.fr', 'yaho.fr': 'yahoo.fr', 'yahoo.con': 'yahoo.com', 'yaho.com': 'yahoo.com',
  'wanado.fr': 'wanadoo.fr', 'wandoo.fr': 'wanadoo.fr', 'wanadoo.com': 'wanadoo.fr', 'orage.fr': 'orange.fr', 'ornage.fr': 'orange.fr',
  'lapost.net': 'laposte.net',
  'icloud.fr': 'icloud.com', 'iclou.com': 'icloud.com', 'icoud.com': 'icloud.com', 'live.con': 'live.com',
};

const DISPOSABLE = new Set(DISPOSABLE_EMAIL_DOMAINS);
// Partie locale : caractères autorisés par les fournisseurs, sans point au début, à la fin ou doublé.
const LOCAL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
// Domaine : libellés de 1 à 63 caractères (lettres, chiffres, tirets internes), extension de 2 lettres ou plus.
const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const TLD_RE = /^(?:[a-z]{2,24}|xn--[a-z0-9-]{1,59})$/i;

export const normalizeEmail = (input: string) => input.trim().toLowerCase();

/** Domaine jetable, y compris ses sous-domaines (x.yopmail.com). */
export function isDisposableEmail(email: string): boolean {
  const domain = normalizeEmail(email).split('@').pop() ?? '';
  const parts = domain.split('.');
  return parts.some((_, i) => DISPOSABLE.has(parts.slice(i).join('.')));
}

/** Proposition de correction (« gmial.com » → « gmail.com »), ou null. */
export function emailSuggestion(email: string): string | null {
  const value = normalizeEmail(email);
  const at = value.lastIndexOf('@');
  if (at < 1) return null;
  const fixed = TYPOS[value.slice(at + 1)];
  return fixed ? `${value.slice(0, at)}@${fixed}` : null;
}

export type EmailCheck = { ok: true; email: string } | { ok: false; error: string };

/**
 * Vérifie une adresse saisie. Pour la connexion, `allowDisposable` : seul le format compte, un compte déjà créé n'est jamais bloqué.
 * Les messages disent quoi faire.
 */
export function checkEmail(input: string, { allowDisposable = false }: { allowDisposable?: boolean } = {}): EmailCheck {
  const email = normalizeEmail(input);
  if (!email) return { ok: false, error: 'Indique ton adresse e-mail.' };
  if (/\s/.test(email)) return { ok: false, error: 'Une adresse e-mail ne contient pas d’espace.' };
  const at = email.lastIndexOf('@');
  if (at < 1 || email.indexOf('@') !== at) return { ok: false, error: 'Il manque le « @ » ou il y en a plusieurs. Exemple : prenom@exemple.fr' };
  const local = email.slice(0, at), domain = email.slice(at + 1);
  const labels = domain.split('.');
  if (email.length > 254 || local.length > 64 || !LOCAL_RE.test(local) || labels.length < 2
    || labels.some((l) => !LABEL_RE.test(l)) || !TLD_RE.test(labels[labels.length - 1]!)) {
    return { ok: false, error: 'Cette adresse e-mail n’est pas valide. Exemple : prenom@exemple.fr' };
  }
  if (allowDisposable) return { ok: true, email };
  const suggestion = emailSuggestion(email);
  if (suggestion) return { ok: false, error: `Vérifie l’adresse : voulais-tu écrire ${suggestion} ?` };
  if (isDisposableEmail(email)) {
    return { ok: false, error: 'Les adresses e-mail jetables ou temporaires ne sont pas acceptées. Utilise ton adresse habituelle.' };
  }
  return { ok: true, email };
}
