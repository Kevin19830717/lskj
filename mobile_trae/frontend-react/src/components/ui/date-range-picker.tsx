"use client"

import { CalendarIcon } from "lucide-react"
import {
  DatePicker as AriaDatePicker,
  type DatePickerProps as AriaDatePickerProps,
  DateRangePicker as AriaDateRangePicker,
  type DateRangePickerProps as AriaDateRangePickerProps,
  type DateValue as AriaDateValue,
  Dialog as AriaDialog,
  type DialogProps as AriaDialogProps,
  type PopoverProps as AriaPopoverProps,
  type ValidationResult as AriaValidationResult,
  composeRenderProps,
  Text,
} from "react-aria-components"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/aria-button"
import {
  Calendar, CalendarCell, CalendarGrid, CalendarGridBody,
  CalendarGridHeader, CalendarHeaderCell, CalendarHeading, RangeCalendar,
} from "@/components/ui/calendar"
import { DateInput } from "@/components/ui/datefield"
import { FieldError, FieldGroup, Label } from "@/components/ui/field"
import { Popover } from "@/components/ui/popover"

const DatePicker = AriaDatePicker
const DateRangePicker = AriaDateRangePicker

const DatePickerContent = ({
  className, popoverClassName, ...props
}: AriaDialogProps & { popoverClassName?: AriaPopoverProps["className"] }) => (
  <Popover
    className={composeRenderProps(popoverClassName, (className) => cn("w-auto p-3", className))}
  >
    <AriaDialog
      className={cn(
        "flex w-full flex-col space-y-4 outline-none sm:flex-row sm:space-x-4 sm:space-y-0",
        className
      )}
      {...props}
    />
  </Popover>
)

interface JollyDatePickerProps<T extends AriaDateValue> extends AriaDatePickerProps<T> {
  label?: string
  description?: string
  errorMessage?: string | ((validation: AriaValidationResult) => string)
}

function JollyDatePicker<T extends AriaDateValue>({
  label, description, errorMessage, className, ...props
}: JollyDatePickerProps<T>) {
  return (
    <DatePicker
      className={composeRenderProps(className, (className) => cn("group flex flex-col gap-2", className))}
      {...props}
    >
      <Label>{label}</Label>
      <FieldGroup className="cursor-pointer relative">
        <Button variant="ghost" className="absolute inset-0 z-20 rounded-md !bg-transparent hover:!bg-transparent focus:!bg-transparent active:!bg-transparent data-[hovered]:!bg-transparent data-[pressed]:!bg-transparent data-[focus-visible]:!bg-transparent" aria-label="打开日期选择器">
          <span className="sr-only">日期</span>
        </Button>
        <DateInput className="flex-1 relative z-10 pointer-events-none" variant="ghost" />
        <CalendarIcon aria-hidden className="size-4 mr-1 relative z-10 pointer-events-none" />
      </FieldGroup>
      {description && <Text className="text-sm text-muted-foreground" slot="description">{description}</Text>}
      <FieldError>{errorMessage}</FieldError>
      <DatePickerContent>
        <Calendar>
          <CalendarHeading />
          <CalendarGrid>
            <CalendarGridHeader>
              {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
            </CalendarGridHeader>
            <CalendarGridBody>
              {(date) => <CalendarCell date={date} />}
            </CalendarGridBody>
          </CalendarGrid>
        </Calendar>
      </DatePickerContent>
    </DatePicker>
  )
}

interface JollyDateRangePickerProps<T extends AriaDateValue> extends AriaDateRangePickerProps<T> {
  label?: string
  description?: string
  errorMessage?: string | ((validation: AriaValidationResult) => string)
}

function JollyDateRangePicker<T extends AriaDateValue>({
  label, description, errorMessage, className, ...props
}: JollyDateRangePickerProps<T>) {
  return (
    <DateRangePicker
      className={composeRenderProps(className, (className) => cn("group flex flex-col gap-2", className))}
      {...props}
    >
      <Label>{label}</Label>
      <FieldGroup className="cursor-pointer relative">
        <Button variant="ghost" className="absolute inset-0 z-20 rounded-md !bg-transparent hover:!bg-transparent focus:!bg-transparent active:!bg-transparent data-[hovered]:!bg-transparent data-[pressed]:!bg-transparent data-[focus-visible]:!bg-transparent" aria-label="打开日期选择器">
          <span className="sr-only">日期</span>
        </Button>
        <DateInput variant="ghost" slot={"start"} className="relative z-10 pointer-events-none" />
        <span aria-hidden className="px-2 text-sm text-muted-foreground relative z-10 pointer-events-none">-</span>
        <DateInput className="flex-1 relative z-10 pointer-events-none" variant="ghost" slot={"end"} />
        <CalendarIcon aria-hidden className="size-4 mr-2 relative z-10 pointer-events-none" />
      </FieldGroup>
      {description && <Text className="text-sm text-muted-foreground" slot="description">{description}</Text>}
      <FieldError>{errorMessage}</FieldError>
      <DatePickerContent>
        <RangeCalendar>
          <CalendarHeading />
          <CalendarGrid>
            <CalendarGridHeader>
              {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
            </CalendarGridHeader>
            <CalendarGridBody>
              {(date) => <CalendarCell date={date} />}
            </CalendarGridBody>
          </CalendarGrid>
        </RangeCalendar>
      </DatePickerContent>
    </DateRangePicker>
  )
}

export { DatePicker, DatePickerContent, DateRangePicker, JollyDatePicker, JollyDateRangePicker }
export type { JollyDatePickerProps, JollyDateRangePickerProps }
