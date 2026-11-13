export const germanCharacters = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

export function hasVietnameseTyping(value: string) {
  return /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịĩọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹ]/iu.test(value.normalize('NFC'));
}
