// Official NBA 2K13 soundtrack, in order. All IDs are verified in docs/soundtrack-ids.json.
// sp is the Spotify track ID (tried first: ad-free, full songs only for logged-in listeners). yt is the
// YouTube video ID (full songs, used when Spotify only gives a 30 second preview) and backup is tried
// when the primary video will not play. A song with no ID for the chosen source is skipped.
(function (root) {
root.SOUNDTRACK = [
  { title: "Ali in the Jungle", artist: "The Hours", sp: "3kr2i1P9eQZitASv83V8zh", yt: "AxNX5M_XSeA", backup: "VWuVEhTJPdw" },
  { title: "Blow the Whistle", artist: "Too Short", sp: "2RPl2HMZE0ycVf1UdlpUkA", yt: "CBJtzEKetBM", backup: "ARMjcGfj_ts" },
  { title: "I Ain't No Joke", artist: "Eric B. and Rakim", sp: "0SwuCcwpFM6x4cu5zOvmi0", yt: "2TN-kDEKxF0", backup: "C_WSlOwP8io" },
  { title: "1901", artist: "Phoenix", sp: "68hYdj3GepWm2R202KhJT7", yt: "36_4xjLFjM0", backup: "Zk4aLrsZVrM" },
  { title: "Pump It Up (Freestyle)", artist: "Jay-Z", sp: "04t8KUfSfNae6iC2yxMzy4", yt: "QZHDoFqH-9E", backup: "UPy36WHJI8w" },
  { title: "Victory (feat. The Notorious B.I.G. and Busta Rhymes)", artist: "Puff Daddy and the Family", sp: "2B9aYvlGefTIgKLhM6ia8t", yt: "ChNBMA-soXA", backup: "x7KIOFaqZeY" },
  { title: "Around the World", artist: "Daft Punk", sp: "1pKYYY0dkg23sQQXi0Q5zN", yt: "K0HSD_i2DvA", backup: "ARfJ55bUAw0" },
  { title: "Shove It (feat. Spank Rock)", artist: "Santigold", sp: "2RBmWAhs6yX4SDYQX4zgF1", yt: "Tg9cN2A7-cA", backup: "2cJComcafGs" },
  { title: "Amazing", artist: "Kanye West", sp: "0m3Ze0cy8qBHSsV2exAfCw", yt: "PH4JPgVD2SM", backup: "16jeTNcEhKs" },
  { title: "Run This Town", artist: "Jay-Z", sp: "5zz33Ev3mwKnpXI9IZ3a8K", yt: "ztygmWtWCjQ", backup: "1z3t9DbBoAA" },
  { title: "Stillness Is the Move", artist: "Dirty Projectors", sp: "477XuL6LgQdlwrbuEVClDh", yt: "YMPF6lpM0XM", backup: "5JJnOkHPVrY" },
  { title: "The World Is Yours", artist: "Nas", sp: "7et2Dx4GOtenAJPrLTfGTz", yt: "e5PnuIRnJW8", backup: "U_u6mqary2A" },
  { title: "Viva La Vida", artist: "Coldplay", sp: "1mea3bSkSGXuIRvnydlB5b", yt: "dvgZkm1xWPE", backup: "1kVxpsi1XQ4" },
  { title: "We Live in Brooklyn, Baby", artist: "Roy Ayers", sp: "4LWXJvwI43g8cSJOiHIcjJ", yt: "qvn1ev1b6Q4", backup: "HZkN9TIMYZY" },
  { title: "Stress", artist: "Justice", sp: "1YdbiBOWvFUi6Zko3HXyEG", yt: "0qXmxVySMzw", backup: "QWaWsgBbFsA" },
  { title: "The Bounce", artist: "Jay-Z", sp: "5p2DRYYjD8AHsgMACqHivu", yt: "9tkiQdhSuRk", backup: "c5lF73ilJkA" },
  { title: "We Major (feat. Nas and Really Doe)", artist: "Kanye West", sp: "3HyodZQJwqWvzPlog5qRjU", yt: "_fr4SV4fGAw", backup: "pfeQbXcBP1U" },
  { title: "Shook Ones, Pt. II", artist: "Mobb Deep", sp: "33ZXjLCpiINn8eQIDYEPTD", yt: "yoYZf-lBF_U", backup: "rTKpYJ80OVQ" },
  { title: "Ima Boss", artist: "Meek Mill", sp: "3TBuzkTLKhIEvxkQsgfi7r", yt: "V1cxP2nCBdU", backup: "o9ysAcGibno" },
  { title: "Mercy (feat. Big Sean, Pusha T and 2 Chainz)", artist: "Kanye West", sp: "2h9o1fLVesJ3DSXqmJBrO0", yt: "7Dqgr0wNyPo", backup: "oBrJUbplZH0" },
  { title: "Elevation", artist: "U2", sp: "0RHPoliIwT6ddbPugZNitX", yt: "19KstSgU-c0", backup: "Jq9NKeGhXww" },
  { title: "On to the Next One", artist: "Jay-Z", sp: "2gflJpSvKQdh0HA4Xd7hHf", yt: "VTYXVwrWz4Y", backup: "FZIBBuz7Sxc" },
  { title: "Public Service Announcement", artist: "Jay-Z", sp: "0BaDo31puylWi3mAdRSCJO", yt: "QUL7zm7XWvo", backup: "vzUHPOZXnhY" },
  { title: "H.A.M.", artist: "Jay-Z", sp: "4tSr86RHxuwctZjZk4mGlL", yt: "U2ozD2B3gIk", backup: "UtoHI0JEfDg" }
];

if (typeof module !== "undefined") module.exports = root.SOUNDTRACK;
})(typeof window !== "undefined" ? window : globalThis);
