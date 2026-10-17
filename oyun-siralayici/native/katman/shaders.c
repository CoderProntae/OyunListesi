/* Ortak HLSL: hem D3D11 hem D3D12 arka ucu aynı shader'ı kullanır.
 * Çalışma anında d3dcompiler_47.dll ile derlenir (Windows ile gelir). */
const char kat_hlsl_vs[] =
    "cbuffer CB : register(b0) { float4 vp; };\n"
    "struct VSIn { float2 pos : POSITION; float2 uv : TEXCOORD0; float4 col : COLOR0; };\n"
    "struct PSIn { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float4 col : COLOR0; };\n"
    "PSIn main(VSIn i) {\n"
    "  PSIn o;\n"
    "  o.pos = float4(i.pos.x * vp.z * 2.0 - 1.0, 1.0 - i.pos.y * vp.w * 2.0, 0.0, 1.0);\n"
    "  o.uv = i.uv; o.col = i.col; return o;\n"
    "}\n";

const char kat_hlsl_ps[] =
    "Texture2D<float> atlas : register(t0);\n"
    "SamplerState samp : register(s0);\n"
    "struct PSIn { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float4 col : COLOR0; };\n"
    "float4 main(PSIn i) : SV_TARGET {\n"
    "  float a = atlas.Sample(samp, i.uv).r;\n"
    "  return float4(i.col.rgb, i.col.a * a);\n"
    "}\n";
