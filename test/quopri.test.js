import test from 'ava';
import utf8 from 'utf8';
import { encode, decode } from '../src/quopri.js';

test('quopri test', async (t) => {
    t.is(decode(' =3D=20'), ' = ');
    t.is(utf8.decode(decode('=E4=BD=A0=E5=A5=BD')), '你好');
    t.is(decode('foo\r\nbar='), 'foo\r\nbar');
    t.is(
        utf8.decode(decode('I=C3=B1t=C3=ABrn=C3=A2ti=C3=B4n=C3=A0liz=C3=A6ti=C3=B8n=E2=98=83=F0=9F=92=\r\n=A9')),
        'Iñtërnâtiônàlizætiøn☃💩',
    );
    t.is(
        decode('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXYZ=20'),
        'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXYZ ',
    );

    t.is(encode(' = '), ' =3D=20');
    t.is(encode('foo\t'), 'foo=09');
    t.is(
        encode('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXYZ='),
        'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXYZ=3D',
    );
    t.is(
        encode('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXYZ '),
        'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXYZ=20',
    );

    t.is(decode(encode('a\nb\nc\n')), 'a\nb\nc\n');
});
