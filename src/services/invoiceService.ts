import { supabase } from '../lib/supabase'
import type { InvoiceImportData } from '../types/invoiceImport'

const INVOICE_SOURCE_BUCKET = 'invoice-source-documents'

export type AvailableInvoiceReception = {
  id: string
  reception_number: string | null
  carrier: string
  other_carrier: string | null
  trailer: string
  reception_date: string
  pallet_count: number
  total_quantity: number
  total_packages: number
  part_numbers: string[]
  already_in_current_invoice: boolean
}

export type InvoicePhoto = {
  id: string
  invoice_id: string
  photo_path: string
  sort_order: number
  created_at: string
}

export type CreateInvoiceInput = {
  invoiceNumber: string
  carrier: string
  packageCount: number
  receptionIds: string[]
  photos: File[]
  importData?: InvoiceImportData | null
  sourceDocuments?: File[]
}

export type UpdateInvoiceInput = {
  invoiceId: string
  invoiceNumber: string
  carrier: string
  packageCount: number
  receptionIds: string[]
}

function normalizeInvoiceNumber(
  value: string,
) {
  const normalized =
    value
      .trim()
      .toUpperCase()

  if (
    normalized.startsWith(
      'INV-',
    )
  ) {
    return normalized
  }

  return `INV-${normalized}`
}

function normalizeCarrier(
  value: string,
) {
  return value
    .trim()
    .toUpperCase()
}

function validateInvoiceInformation({
  invoiceNumber,
  carrier,
  packageCount,
  receptionIds,
  allowNoReceptions = false,
}: {
  invoiceNumber: string
  carrier: string
  packageCount: number
  receptionIds: string[]
  allowNoReceptions?: boolean
}) {
  if (
    !invoiceNumber ||
    invoiceNumber === 'INV-'
  ) {
    throw new Error(
      'El número de factura es obligatorio.',
    )
  }

  if (!carrier) {
    throw new Error(
      'El carrier es obligatorio.',
    )
  }

  if (
    !Number.isInteger(
      packageCount,
    ) ||
    packageCount < 0
  ) {
    throw new Error(
      'El número de bultos debe ser un número entero válido.',
    )
  }

  if (
    !allowNoReceptions &&
    receptionIds.length === 0
  ) {
    throw new Error(
      'Selecciona al menos una recepción.',
    )
  }
}

function getFileExtension(
  file: File,
) {
  const extension =
    file.name
      .split('.')
      .pop()
      ?.toLowerCase()

  return extension || 'jpg'
}

function createInvoicePhotoPath(
  invoiceId: string,
  file: File,
  index: number,
) {
  const extension =
    getFileExtension(file)

  const uniquePart =
    `${Date.now()}-${crypto.randomUUID()}`

  return [
    invoiceId,
    `${index}-${uniquePart}.${extension}`,
  ].join('/')
}

async function removeUploadedPaths(
  paths: string[],
) {
  if (
    paths.length === 0
  ) {
    return
  }

  const {
    error,
  } =
    await supabase.storage
      .from(
        'invoice-documents',
      )
      .remove(paths)

  if (error) {
    console.error(
      'No se pudieron limpiar archivos de factura:',
      error,
    )
  }
}

async function uploadInvoiceFiles(
  invoiceId: string,
  photos: File[],
  startingIndex = 0,
) {
  const uploadedPaths:
    string[] = []

  try {
    for (
      let index = 0;
      index < photos.length;
      index += 1
    ) {
      const file =
        photos[index]

      const storagePath =
        createInvoicePhotoPath(
          invoiceId,
          file,
          startingIndex +
            index,
        )

      const {
        error:
          uploadError,
      } =
        await supabase.storage
          .from(
            'invoice-documents',
          )
          .upload(
            storagePath,
            file,
            {
              upsert:
                false,
            },
          )

      if (uploadError) {
        throw new Error(
          `No se pudo subir ${file.name}: ${uploadError.message}`,
        )
      }

      uploadedPaths.push(
        storagePath,
      )
    }

    return uploadedPaths
  } catch (error) {
    await removeUploadedPaths(
      uploadedPaths,
    )

    throw error
  }
}

type UploadedSourceDocument = {
  file_name: string
  storage_path: string
  mime_type: string
  document_type: 'csv' | 'evidence'
}

function createInvoiceSourcePath(
  invoiceId: string,
  file: File,
  index: number,
) {
  const extension = getFileExtension(file)
  const uniquePart = `${Date.now()}-${crypto.randomUUID()}`

  return [
    invoiceId,
    'source',
    `${index}-${uniquePart}.${extension}`,
  ].join('/')
}

async function uploadInvoiceSourceFiles(
  invoiceId: string,
  files: File[],
) {
  const uploaded: UploadedSourceDocument[] = []

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const storagePath = createInvoiceSourcePath(invoiceId, file, index)
      const { error: uploadError } = await supabase.storage
        .from(INVOICE_SOURCE_BUCKET)
        .upload(storagePath, file, { upsert: false })

      if (uploadError) {
        throw new Error(`No se pudo subir ${file.name}: ${uploadError.message}`)
      }

      uploaded.push({
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || 'application/octet-stream',
        document_type: file.name.toLowerCase().endsWith('.csv')
          ? 'csv'
          : 'evidence',
      })
    }

    return uploaded
  } catch (error) {
    const uploadedPaths = uploaded.map((document) => document.storage_path)

    if (uploadedPaths.length > 0) {
      await supabase.storage
        .from(INVOICE_SOURCE_BUCKET)
        .remove(uploadedPaths)
    }

    throw error
  }
}

export async function getAvailableInvoiceReceptions(
  carrier: string,
  invoiceId: string | null = null,
): Promise<
  AvailableInvoiceReception[]
> {
  const normalizedCarrier =
    normalizeCarrier(
      carrier,
    )

  if (!normalizedCarrier) {
    return []
  }

  const {
    data,
    error,
  } = await (
    supabase.rpc as any
  )(
    'get_available_invoice_receptions',
    {
      p_carrier:
        normalizedCarrier,

      p_invoice_id:
        invoiceId,
    },
  )

  if (error) {
    throw new Error(
      `No se pudieron cargar las recepciones disponibles: ${error.message}`,
    )
  }

  return (
    data ||
    []
  ).map(
    (
      reception:
        AvailableInvoiceReception,
    ) => ({
      ...reception,

      pallet_count:
        Number(
          reception.pallet_count ||
            0,
        ),

      total_quantity:
        Number(
          reception.total_quantity ||
            0,
        ),

      total_packages:
        Number(
          reception.total_packages ||
            0,
        ),

      part_numbers:
        reception.part_numbers ||
        [],

      already_in_current_invoice:
        Boolean(
          reception.already_in_current_invoice,
        ),
    }),
  )
}

export async function createInvoiceWithReceptions(
  input: CreateInvoiceInput,
) {
  const invoiceNumber =
    normalizeInvoiceNumber(
      input.invoiceNumber,
    )

  const carrier =
    normalizeCarrier(
      input.carrier,
    )

  validateInvoiceInformation({
    invoiceNumber,
    carrier,
    packageCount:
      input.packageCount,
    receptionIds:
      input.receptionIds,
    allowNoReceptions:
      Boolean(input.importData),
  })

  if (input.photos.length === 0 && !input.importData) {
    throw new Error(
      'Agrega al menos una fotografía de la factura.',
    )
  }

  const sourceDocuments = input.sourceDocuments || []

  if (
    input.importData &&
    !sourceDocuments.some((file) => file.name.toLowerCase().endsWith('.csv'))
  ) {
    throw new Error('Adjunta el archivo CSV utilizado para importar la factura.')
  }

  if (input.importData && !input.importData.valid) {
    throw new Error('Los totales del CSV no coinciden. Corrige el archivo antes de guardar.')
  }

  const invoiceId =
    crypto.randomUUID()

  const uploadedPaths =
    await uploadInvoiceFiles(
      invoiceId,
      input.photos,
    )

  let uploadedSourceDocuments: UploadedSourceDocument[] = []

  try {
    uploadedSourceDocuments = await uploadInvoiceSourceFiles(
      invoiceId,
      sourceDocuments,
    )

    const standardArguments = {
      p_invoice_id: invoiceId,
      p_invoice_number: invoiceNumber,
      p_carrier: carrier,
      p_package_count: input.packageCount,
      p_reception_ids: input.receptionIds,
      p_photo_paths: uploadedPaths,
    }

    const importArguments = input.importData
      ? {
          ...standardArguments,
          p_import_header: {
            source_file_name: input.importData.sourceFileName,
            raw_invoice_identifier: input.importData.rawInvoiceIdentifier,
            invoice_date: input.importData.invoiceDate,
            fiscal_week: input.importData.fiscalWeek,
            client_code: input.importData.clientCode,
            supplier_code: input.importData.supplierCode,
            currency: input.importData.currency,
            invoice_total: input.importData.invoiceTotal,
            total_quantity: input.importData.totalQuantity,
            total_weight: input.importData.totalWeight,
            package_count: input.importData.packageCount,
            incoterm: input.importData.incoterm,
            invoice_country: input.importData.invoiceCountry,
            container_number: input.importData.containerNumber,
            customs_entry: input.importData.customsEntry,
            observations: input.importData.observations,
          },
          p_import_lines: input.importData.lines.map((line) => ({
            line_number: line.lineNumber,
            part_number: line.partNumber,
            tariff_code: line.tariffCode,
            description: line.description,
            commercial_quantity: line.commercialQuantity,
            commercial_unit_code: line.commercialUnitCode,
            unit_price: line.unitPrice,
            total_price: line.totalPrice,
            tariff_quantity: line.tariffQuantity,
            tariff_unit_code: line.tariffUnitCode,
            weight: line.weight,
            origin: line.origin,
            seller: line.seller,
            package_count: line.packageCount,
          })),
          p_source_documents: uploadedSourceDocuments,
        }
      : null

    const rpcName = input.importData && input.receptionIds.length === 0
      ? 'create_imported_invoice_without_receptions'
      : input.importData
        ? 'create_imported_invoice_with_receptions'
        : 'create_invoice_with_receptions'

    const rpcArguments =
      rpcName === 'create_imported_invoice_without_receptions' && importArguments
        ? {
            p_invoice_id: importArguments.p_invoice_id,
            p_invoice_number: importArguments.p_invoice_number,
            p_carrier: importArguments.p_carrier,
            p_package_count: importArguments.p_package_count,
            p_photo_paths: importArguments.p_photo_paths,
            p_import_header: importArguments.p_import_header,
            p_import_lines: importArguments.p_import_lines,
            p_source_documents: importArguments.p_source_documents,
          }
        : importArguments || standardArguments

    const {
      data,
      error,
    } = await (
      supabase.rpc as any
    )(
      rpcName,
      rpcArguments,
    )

    if (error) {
      throw new Error(
        error.message,
      )
    }

    return {
      invoiceId:
        String(
          data ||
            invoiceId,
        ),

      invoiceNumber,
    }
  } catch (error) {
    await removeUploadedPaths(uploadedPaths)

    const uploadedSourcePaths = uploadedSourceDocuments.map(
      (document) => document.storage_path,
    )

    if (uploadedSourcePaths.length > 0) {
      await supabase.storage
        .from(INVOICE_SOURCE_BUCKET)
        .remove(uploadedSourcePaths)
    }

    throw error
  }
}

export async function updateInvoiceWithReceptions(
  input: UpdateInvoiceInput,
) {
  const invoiceNumber =
    normalizeInvoiceNumber(
      input.invoiceNumber,
    )

  const carrier =
    normalizeCarrier(
      input.carrier,
    )

  validateInvoiceInformation({
    invoiceNumber,
    carrier,
    packageCount:
      input.packageCount,
    receptionIds:
      input.receptionIds,
  })

  const {
    data,
    error,
  } = await (
    supabase.rpc as any
  )(
    'update_invoice_with_receptions',
    {
      p_invoice_id:
        input.invoiceId,

      p_invoice_number:
        invoiceNumber,

      p_carrier:
        carrier,

      p_package_count:
        input.packageCount,

      p_reception_ids:
        input.receptionIds,
    },
  )

  if (error) {
    throw new Error(
      error.message,
    )
  }

  return {
    invoiceId:
      String(
        data ||
          input.invoiceId,
      ),

    invoiceNumber,
  }
}

export async function getInvoicePhotos(
  invoiceId: string,
): Promise<InvoicePhoto[]> {
  const {
    data,
    error,
  } = await supabase
    .from(
      'invoice_photos',
    )
    .select(`
      id,
      invoice_id,
      photo_path,
      sort_order,
      created_at
    `)
    .eq(
      'invoice_id',
      invoiceId,
    )
    .order(
      'sort_order',
      {
        ascending:
          true,
      },
    )

  if (error) {
    throw new Error(
      `No se pudieron cargar las fotografías: ${error.message}`,
    )
  }

  return (
    data ||
    []
  ) as InvoicePhoto[]
}

export async function addInvoicePhotos(
  invoiceId: string,
  photos: File[],
) {
  if (
    photos.length ===
    0
  ) {
    return []
  }

  const existingPhotos =
    await getInvoicePhotos(
      invoiceId,
    )

  const startingIndex =
    existingPhotos.length

  const uploadedPaths =
    await uploadInvoiceFiles(
      invoiceId,
      photos,
      startingIndex,
    )

  try {
    const photoRows =
      uploadedPaths.map(
        (
          photoPath,
          index,
        ) => ({
          invoice_id:
            invoiceId,

          photo_path:
            photoPath,

          sort_order:
            startingIndex +
            index,
        }),
      )

    const {
      data,
      error:
        insertError,
    } = await supabase
      .from(
        'invoice_photos',
      )
      .insert(
        photoRows,
      )
      .select(`
        id,
        invoice_id,
        photo_path,
        sort_order,
        created_at
      `)

    if (insertError) {
      throw new Error(
        insertError.message,
      )
    }

    if (
      existingPhotos.length ===
      0 &&
      uploadedPaths[0]
    ) {
      const {
        error:
          updateError,
      } = await supabase
        .from(
          'invoices',
        )
        .update({
          invoice_photo_path:
            uploadedPaths[0],
        })
        .eq(
          'id',
          invoiceId,
        )

      if (updateError) {
        throw new Error(
          updateError.message,
        )
      }
    }

    return (
      data ||
      []
    ) as InvoicePhoto[]
  } catch (error) {
    await removeUploadedPaths(
      uploadedPaths,
    )

    throw error
  }
}

export async function deleteInvoicePhoto(
  invoiceId: string,
  photoId: string,
) {
  const existingPhotos =
    await getInvoicePhotos(
      invoiceId,
    )

  if (
    existingPhotos.length <=
    1
  ) {
    throw new Error(
      'La factura debe conservar al menos una fotografía.',
    )
  }

  const photoToDelete =
    existingPhotos.find(
      (photo) =>
        photo.id ===
        photoId,
    )

  if (!photoToDelete) {
    throw new Error(
      'No se encontró la fotografía seleccionada.',
    )
  }

  const remainingPhotos =
    existingPhotos.filter(
      (photo) =>
        photo.id !==
        photoId,
    )

  const {
    error:
      deleteError,
  } = await supabase
    .from(
      'invoice_photos',
    )
    .delete()
    .eq(
      'id',
      photoId,
    )
    .eq(
      'invoice_id',
      invoiceId,
    )

  if (deleteError) {
    throw new Error(
      deleteError.message,
    )
  }

  const reorderedRows =
    remainingPhotos.map(
      (
        photo,
        index,
      ) => ({
        id:
          photo.id,

        sort_order:
          index,
      }),
    )

  for (
    const photo of reorderedRows
  ) {
    const {
      error:
        reorderError,
    } = await supabase
      .from(
        'invoice_photos',
      )
      .update({
        sort_order:
          photo.sort_order,
      })
      .eq(
        'id',
        photo.id,
      )

    if (reorderError) {
      console.error(
        'No se pudo reordenar una fotografía:',
        reorderError,
      )
    }
  }

  const newPrimaryPath =
    remainingPhotos[0]
      .photo_path

  const {
    error:
      primaryUpdateError,
  } = await supabase
    .from(
      'invoices',
    )
    .update({
      invoice_photo_path:
        newPrimaryPath,
    })
    .eq(
      'id',
      invoiceId,
    )

  if (primaryUpdateError) {
    throw new Error(
      primaryUpdateError.message,
    )
  }

  const {
    error:
      storageError,
  } =
    await supabase.storage
      .from(
        'invoice-documents',
      )
      .remove([
        photoToDelete
          .photo_path,
      ])

  if (storageError) {
    console.error(
      'La fotografía se eliminó de la base de datos, pero no del almacenamiento:',
      storageError,
    )
  }

  return remainingPhotos.map(
    (
      photo,
      index,
    ) => ({
      ...photo,

      sort_order:
        index,
    }),
  )
}
