/**
 * Quoted-printable decode string.
 */
export function decode(input) {
    // Reference: https://mths.be/quoted-printable by @mathias | MIT license
    return (
        input
            // https://tools.ietf.org/html/rfc2045#section-6.7, rule 3:
            // "Therefore, when decoding a `Quoted-Printable` body, any trailing white
            // space on a line must be deleted, as it will necessarily have been added
            // by intermediate transport agents"
            .replace(/[\t\x20]$/gm, '')
            // Remove hard line breaks preceded by `=`. Proper `Quoted-Printable`-
            // encoded data only contains CRLF line  endings, but for compatibility
            // reasons we support separate CR and LF too.
            .replace(/=(?:\r\n?|\n|$)/g, '')
            // Decode escape sequences of the form `=XX` where `XX` is any
            // combination of two hexidecimal digits. For optimal compatibility,
            // lowercase hexadecimal digits are supported as well. See
            // https://tools.ietf.org/html/rfc2045#section-6.7, note 1.
            .replace(/=([a-fA-F0-9]{2})/g, function (_, $1) {
                let codePoint = parseInt($1, 16);
                return String.fromCharCode(codePoint);
            })
    );
}

/**
 * Quoted-printable encode string or Buffer.
 */
export function encode(buffer) {
    // Reference: https://npmjs.com/package/libqp by Andris Reinman | MIT license
    if (typeof buffer === 'string') {
        buffer = Buffer.from(buffer, 'utf-8');
    }

    // usable characters that do not need encoding
    const ranges = [
        // https://tools.ietf.org/html/rfc2045#section-6.7
        [0x09], // <TAB>
        [0x0a], // <LF>
        [0x0d], // <CR>
        [0x20, 0x3c], // <SP>!"#$%&'()*+,-./0123456789:;
        [0x3e, 0x7e], // >?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}
    ];
    let result = '';

    for (let i = 0, len = buffer.length; i < len; i++) {
        let ord = buffer[i];
        // if the char is in allowed range, then keep as is, unless it is a ws in the end of a line
        if (
            checkRanges(ord, ranges) &&
            !(
                (ord === 0x20 || ord === 0x09) &&
                (i === len - 1 || buffer[i + 1] === 0x0a || buffer[i + 1] === 0x0d)
            )
        ) {
            result += String.fromCharCode(ord);
            continue;
        }
        result += '=' + (ord < 0x10 ? '0' : '') + ord.toString(16).toUpperCase();
    }

    return result;
}

/**
 * Helper function to check if a number is inside provided ranges
 */
function checkRanges(nr, ranges) {
    for (let i = ranges.length - 1; i >= 0; i--) {
        if (!ranges[i].length) {
            continue;
        }
        if (ranges[i].length === 1 && nr === ranges[i][0]) {
            return true;
        }
        if (ranges[i].length === 2 && nr >= ranges[i][0] && nr <= ranges[i][1]) {
            return true;
        }
    }
    return false;
}
