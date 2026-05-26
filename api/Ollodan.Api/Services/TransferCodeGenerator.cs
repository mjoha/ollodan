using System.Security.Cryptography;

namespace Ollodan.Api.Services;

public static class TransferCodeGenerator
{
    // Crockford-like alphabet without I, L, O, 0, 1.
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    public const int Length = 6;

    public static string Generate()
    {
        Span<char> chars = stackalloc char[Length];
        for (var i = 0; i < Length; i++)
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(chars);
    }

    public static string Normalize(string raw)
    {
        var filtered = new char[raw.Length];
        var n = 0;
        foreach (var c in raw.ToUpperInvariant())
        {
            if (char.IsLetterOrDigit(c))
                filtered[n++] = c;
        }
        return n == Length ? new string(filtered, 0, Length) : "";
    }

    public static string FormatDisplay(string code) =>
        code.Length == Length ? $"{code[..3]}-{code[3..]}" : code;
}
