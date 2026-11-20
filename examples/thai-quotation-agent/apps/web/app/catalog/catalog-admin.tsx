"use client";

import { decodeCsvBytes } from "@eve-thai-quotation-extension/core";
import type { ShopCatalog } from "@eve-thai-quotation-extension/eve/desk";
import { DownloadIcon, Undo2Icon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { replaceCatalog, setPrice, signIn, undoCatalog, type CatalogResult } from "./actions";

const MAX_CATALOG_BYTES = 1_000_000;

const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

export function CatalogAdmin({ initial }: { initial: ShopCatalog }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [catalog, setCatalog] = useState(initial);
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();

  const apply = (run: () => Promise<CatalogResult>) => {
    setError(undefined);
    setNote(undefined);
    startTransition(async () => {
      const result = await run().catch((): CatalogResult => ({ ok: false, error: "ไม่สามารถติดต่อระบบได้" }));
      if (result.ok) {
        setCatalog(result.catalog);
        setNote(result.note);
      } else {
        setError(result.error);
      }
    });
  };

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_CATALOG_BYTES) {
      setError("ไฟล์ใหญ่เกินไป (จำกัด 1 MB)");
      return;
    }
    const decoded = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    if ("error" in decoded) {
      setError(decoded.error.message);
      return;
    }
    apply(() => replaceCatalog(decoded.text));
  }

  const query = filter.trim().toLowerCase();
  const shown = query
    ? catalog.items.filter((item) =>
        [item.sku, item.name, item.nameEn, item.category, ...item.aliases].some((text) => text.toLowerCase().includes(query)),
      )
    : catalog.items;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a className="text-muted-foreground text-sm underline underline-offset-4" href="/">
            ← กลับหน้าสร้างใบเสนอราคา
          </a>
          <h1 className="font-heading mt-1 text-2xl font-semibold">แคตตาล็อกของร้าน</h1>
          <p className="text-muted-foreground text-sm">
            ราคาชุดนี้ใช้กับทั้งหน้าเว็บและแชต การแก้ไขมีผลทันทีกับร่างที่ยังไม่อนุมัติ ใบที่ออกแล้วไม่เปลี่ยน
          </p>
        </div>
        <Badge variant={catalog.source === "stored" ? "success" : "soft"}>
          {catalog.source === "stored"
            ? `แก้ไขล่าสุด ${catalog.updatedAt ? when(catalog.updatedAt) : ""} โดย ${catalog.updatedBy ?? "-"}`
            : "ใช้ไฟล์ตั้งต้นของระบบ ยังไม่เคยแก้ไข"}
        </Badge>
      </header>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>ดำเนินการไม่สำเร็จ</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {note && (
        <Alert variant="success" role="status">
          <AlertTitle>บันทึกแล้ว</AlertTitle>
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>แทนที่ทั้งชุด</CardTitle>
          <CardDescription>
            ดาวน์โหลดไฟล์ปัจจุบัน แก้ในโปรแกรมตาราง แล้วอัปโหลดกลับ ไฟล์ที่มีข้อผิดพลาดจะไม่ถูกนำมาใช้
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button disabled={pending} onClick={() => fileInput.current?.click()}>
            <UploadIcon />
            อัปโหลด CSV ใหม่
          </Button>
          <input
            ref={fileInput}
            accept=".csv,text/csv"
            aria-label="ไฟล์แคตตาล็อก CSV"
            className="sr-only"
            type="file"
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button asChild variant="outline">
            <a href="/catalog/download">
              <DownloadIcon />
              ดาวน์โหลด CSV ปัจจุบัน
            </a>
          </Button>
          <Button variant="outline" disabled={pending || !catalog.canUndo} onClick={() => apply(undoCatalog)}>
            <Undo2Icon />
            ย้อนกลับการแก้ไขล่าสุด
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>รายการสินค้า {catalog.items.length.toLocaleString("th-TH")} รายการ</CardTitle>
          <CardDescription>แก้ราคาได้ทีละรายการ พิมพ์ราคาใหม่แล้วกด Enter หรือคลิกออกจากช่อง</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            aria-label="ค้นหาสินค้า"
            className="max-w-sm"
            placeholder="ค้นหาด้วยชื่อ รหัส หรือชื่อเรียกอื่น"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead className="min-w-64">สินค้า</TableHead>
                  <TableHead>หน่วย</TableHead>
                  <TableHead className="w-36 text-right">ราคา/หน่วย (บาท)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground py-6 text-center">
                      ไม่พบสินค้าที่ตรงกับคำค้น
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((item) => (
                  <TableRow key={item.sku} className="align-top">
                    <TableCell className="whitespace-nowrap">{item.sku}</TableCell>
                    <TableCell className="whitespace-normal">
                      {item.name}
                      {item.aliases.length > 0 && (
                        <p className="text-muted-foreground text-xs">เรียกอีกอย่าง: {item.aliases.join(", ")}</p>
                      )}
                    </TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className="text-right">
                      <PriceInput
                        key={`${item.sku}:${item.unitPrice}`}
                        label={`ราคาของ ${item.name}`}
                        price={item.unitPrice}
                        disabled={pending}
                        onCommit={(price) => apply(() => setPrice(item.sku, price))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function PriceInput({
  label,
  price,
  disabled,
  onCommit,
}: {
  label: string;
  price: string;
  disabled: boolean;
  onCommit: (price: string) => void;
}) {
  const [text, setText] = useState(price);
  const plain = (value: string) => value.replace(/,/g, "").trim();
  const commit = () => {
    if (plain(text) !== "" && Number(plain(text)) !== Number(plain(price))) onCommit(plain(text));
    else setText(price);
  };
  return (
    <Input
      aria-label={label}
      className="num ml-auto w-28 text-right"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

export function SignIn() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="font-heading text-xl font-semibold">เข้าสู่ระบบผู้ดูแล</h1>
      <p className="text-muted-foreground text-sm">หน้านี้ใช้แก้ไขราคาของร้าน จึงต้องใช้รหัสผ่านของผู้ดูแล</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setWrong(false);
          startTransition(async () => {
            const result = await signIn(password);
            if (result.ok) router.refresh();
            else setWrong(true);
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="admin-password">รหัสผ่าน</Label>
          <Input
            id="admin-password"
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {wrong && (
          <p className="text-destructive text-sm" role="alert">
            รหัสผ่านไม่ถูกต้อง
          </p>
        )}
        <Button disabled={pending || password === ""} type="submit">
          เข้าสู่ระบบ
        </Button>
      </form>
    </main>
  );
}
