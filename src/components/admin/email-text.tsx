/**
 * Email sebagai identitas utama: diisolasi kiri-ke-kanan (<bdi dir="ltr">, nama di sekitarnya tidak
 * bisa membalik urutannya) dan tidak pernah dipotong. Bila tidak muat, baris dipatahkan lebih dulu
 * sebelum "@" (<wbr>), baru di karakter mana pun (pemanggil memberi [overflow-wrap:anywhere]).
 */
export function EmailText({ email }: { email: string }) {
  const at = email.lastIndexOf("@");
  return (
    <bdi dir="ltr">
      {at > 0 ? (
        <>
          {email.slice(0, at)}
          <wbr />
          {email.slice(at)}
        </>
      ) : (
        email
      )}
    </bdi>
  );
}
